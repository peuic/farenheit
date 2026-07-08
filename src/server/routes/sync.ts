import { join } from "node:path";
import { requestDownload } from "../../indexer/icloud";
import type { Ctx } from "./context";

// Per-file cooldown between brctl download calls. Multiple UI refreshes,
// Kobo polling and OPDS clients can otherwise slam brctl with the same
// paths dozens of times per minute, which does nothing useful and buries
// the real error we now log. 30s is short enough that a manual retry
// after a fix still lands quickly.
const RETRY_COOLDOWN_MS = 30_000;
const lastAttemptAt = new Map<string, number>();

// How many consecutive failures before a book is marked sync_failed and
// dropped from bulk auto-retries. Five leaves room for transient iCloud
// wobbles without letting a truly broken file loop forever.
const FAIL_AFTER = 5;

async function materializeInBackground(
  ctx: Ctx,
  unsyncedRelPaths: string[],
): Promise<void> {
  const now = Date.now();
  for (const rel of unsyncedRelPaths) {
    const last = lastAttemptAt.get(rel) ?? 0;
    if (now - last < RETRY_COOLDOWN_MS) {
      // Silently skip — logging every debounced call would drown out the
      // real signals (successes and failures). The UI still returns 302
      // so the user sees the same "retry scheduled" experience.
      continue;
    }
    lastAttemptAt.set(rel, now);

    const full = join(ctx.config.booksDir, rel);
    try {
      const r = await requestDownload(full);
      if (r.code === 0) {
        console.log(`[sync-retry] requested download: ${rel}`);
        ctx.store.recordSyncAttempt(rel, { ok: true }, FAIL_AFTER);
      } else {
        // brctl exited non-zero — the download will never complete without
        // intervention. Log the real reason and persist it so the UI and
        // `farenheit doctor` can surface why this book is stuck instead of
        // a silent forever-retry.
        const stderr = r.stderr.trim().replace(/\s+/g, " ");
        const errMsg = `code ${r.code}: ${stderr || "(no stderr)"}`;
        console.warn(`[sync-retry] brctl download failed for ${rel}: ${errMsg}`);
        ctx.store.recordSyncAttempt(rel, { ok: false, error: errMsg }, FAIL_AFTER);
      }
    } catch (e) {
      const errMsg = (e as Error).message;
      console.warn(`[sync-retry] failed on ${rel}: ${errMsg}`);
      ctx.store.recordSyncAttempt(rel, { ok: false, error: errMsg }, FAIL_AFTER);
    }
  }
  // After triggering downloads, give fileproviderd a moment, then re-stat.
  // This also catches the common case where the file was already materialized
  // but our DB had a stale `on_disk=false`.
  setTimeout(() => {
    void ctx.onRefreshUnsynced?.();
  }, 3_000);
}

export function handleSyncRetry(ctx: Ctx): Response {
  // Bulk auto-retry: drop books already marked sync_failed. They'll only
  // move again on an explicit per-book retry from the UI (which resets
  // sync_failed via handleBookSyncRetry).
  const unsynced = ctx.store
    .list({})
    .filter((b) => !b.onDisk && !b.syncFailed);
  const paths = unsynced.map((b) => b.relPath);

  console.log(`[sync-retry] triggering download for ${paths.length} book(s)`);
  void materializeInBackground(ctx, paths);

  return new Response(null, {
    status: 302,
    headers: { Location: "/" },
  });
}

export function handleBookSyncRetry(ctx: Ctx, idStr: string): Response {
  const id = Number.parseInt(idStr, 10);
  if (Number.isNaN(id)) {
    return new Response("bad id", { status: 400 });
  }
  const book = ctx.store.getById(id);
  if (!book) {
    return new Response(null, { status: 302, headers: { Location: "/" } });
  }
  // A manual per-book retry is the user's signal that they've done
  // something on their end (re-uploaded, waited for iCloud to catch up):
  // clear the failure state and the cooldown so this attempt actually
  // hits brctl instead of getting debounced or auto-skipped.
  ctx.store.resetSyncStatus(id);
  lastAttemptAt.delete(book.relPath);
  console.log(`[sync-retry] triggering download for single book: ${book.relPath}`);
  void materializeInBackground(ctx, [book.relPath]);
  return new Response(null, {
    status: 302,
    headers: { Location: `/book/${id}` },
  });
}
