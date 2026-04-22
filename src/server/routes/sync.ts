import { join } from "node:path";
import { requestDownload } from "../../indexer/icloud";
import type { Ctx } from "./context";

async function materializeInBackground(
  ctx: Ctx,
  unsyncedRelPaths: string[],
): Promise<void> {
  for (const rel of unsyncedRelPaths) {
    const full = join(ctx.config.booksDir, rel);
    try {
      await requestDownload(full);
      console.log(`[sync-retry] requested download: ${rel}`);
    } catch (e) {
      console.warn(`[sync-retry] failed on ${rel}: ${(e as Error).message}`);
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
  const unsynced = ctx.store.list({}).filter((b) => !b.onDisk);
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
  console.log(`[sync-retry] triggering download for single book: ${book.relPath}`);
  void materializeInBackground(ctx, [book.relPath]);
  return new Response(null, {
    status: 302,
    headers: { Location: `/book/${id}` },
  });
}
