import { readdirSync, statSync, existsSync, type Stats } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { parseEpub } from "./parser";
import { processCover } from "./cover";
import { ensureMaterialized } from "./icloud";
import type { Store } from "../store/store";
import type { BookInput } from "../store/types";

export type IndexerDeps = {
  booksDir: string;
  coversDir: string;
  store: Store;
  skipICloudCheck?: boolean;
};

export class Indexer {
  private watcher: FSWatcher | null = null;

  constructor(private deps: IndexerDeps) {}

  async scanAll(): Promise<void> {
    const files = this.walk(this.deps.booksDir);
    for (const full of files) {
      await this.handleAdd(full);
    }
  }

  watch(): void {
    if (this.watcher) return;
    this.watcher = chokidar.watch(this.deps.booksDir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      depth: 10,
    });
    this.watcher.on("add", (p) => {
      if (p.toLowerCase().endsWith(".epub")) void this.handleAdd(p);
    });
    this.watcher.on("change", (p) => {
      if (p.toLowerCase().endsWith(".epub")) void this.handleAdd(p);
    });
    this.watcher.on("unlink", (p) => {
      if (p.toLowerCase().endsWith(".epub")) {
        const rel = relative(this.deps.booksDir, p);
        this.deps.store.deleteByRelPath(rel);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  // Re-stat books currently flagged as not-on-disk and re-index any that
  // became materialized. chokidar misses this event when iCloud finishes
  // downloading silently (blocks change but logical size stays the same).
  // Triggered on-demand from the UI retry button — no periodic polling.
  async refreshUnsynced(): Promise<number> {
    const unsynced = this.deps.store.list({}).filter((b) => !b.onDisk);
    if (unsynced.length === 0) return 0;
    let fixed = 0;
    for (const b of unsynced) {
      const full = join(this.deps.booksDir, b.relPath);
      try {
        await this.handleAdd(full);
        const after = this.deps.store.getByRelPath(b.relPath);
        if (after?.onDisk) fixed++;
      } catch {
        // swallow — logs happen inside handleAdd
      }
    }
    if (fixed > 0) console.log(`[indexer] refresh materialized ${fixed} book(s)`);
    return fixed;
  }

  private walk(dir: string): string[] {
    const out: string[] = [];
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...this.walk(full));
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".epub")) out.push(full);
    }
    return out;
  }

  private async handleAdd(fullPath: string): Promise<void> {
    try {
      if (!this.deps.skipICloudCheck) {
        try {
          await ensureMaterialized(fullPath, 60_000);
        } catch (e) {
          console.warn(`[indexer] iCloud materialization failed for ${fullPath}: ${(e as Error).message}`);
          return;
        }
      }

      let st: Stats;
      try {
        st = statSync(fullPath);
      } catch {
        return;
      }

      const relPath = relative(this.deps.booksDir, fullPath);
      const firstSegment = relPath.split(sep)[0];
      const hasSubdir = relPath.includes(sep);
      const category = hasSubdir ? firstSegment ?? null : null;
      const filename = basename(fullPath);
      // mtime here = "when did this file appear on disk" — use birthtime (creation)
      // so the UI sorts by when the user added the book, not by the publisher's
      // modification date. Fall back to mtime for filesystems without birthtime.
      const mtime = Math.floor(st.birthtimeMs || st.mtimeMs);
      // iCloud placeholder detection: materialized files have disk blocks
      // covering the logical size; placeholders have ~0 blocks.
      const onDisk = st.size === 0 ? true : (st.blocks * 512) >= st.size * 0.8;

      const existing = this.deps.store.getByRelPath(relPath);
      if (existing
          && existing.mtime === mtime
          && existing.sizeBytes === st.size
          && existing.onDisk === onDisk) {
        return; // unchanged — idempotent skip
      }

      // If the file isn't materialized yet, skip parse (would EDEADLK or
      // return garbage). Record it with filename as title so it shows up
      // in the list with an "unsynced" indicator.
      if (!onDisk) {
        this.deps.store.upsert({
          relPath,
          filename,
          title: existing?.title ?? filename,
          author: existing?.author ?? null,
          description: existing?.description ?? null,
          category,
          coverFilename: existing?.coverFilename ?? null,
          sizeBytes: st.size,
          mtime,
          onDisk: false,
        });
        return;
      }

      let parseResult;
      try {
        parseResult = await parseEpub(fullPath);
      } catch (e) {
        console.warn(`[indexer] parse failed for ${fullPath}: ${(e as Error).message}`);
        this.deps.store.upsert({
          relPath,
          filename,
          title: filename,
          author: null,
          description: null,
          category,
          coverFilename: null,
          sizeBytes: st.size,
          mtime,
          onDisk,
        });
        return;
      }

      const title = parseResult.title ?? filename;
      let coverFilename: string | null = null;
      if (parseResult.cover) {
        const safeBase = relPath.replace(/[^\w.-]+/g, "_");
        const coverFile = `${safeBase}.webp`;
        const destPath = join(this.deps.coversDir, coverFile);
        try {
          await processCover(parseResult.cover.data, destPath);
          coverFilename = coverFile;
        } catch (e) {
          console.warn(`[indexer] cover resize failed for ${fullPath}: ${(e as Error).message}`);
          coverFilename = null;
        }
      }

      const input: BookInput = {
        relPath,
        filename,
        title,
        author: parseResult.author,
        description: parseResult.description,
        category,
        coverFilename,
        sizeBytes: st.size,
        mtime,
        onDisk,
      };
      this.deps.store.upsert(input);
    } catch (e) {
      console.warn(`[indexer] unexpected error handling ${fullPath}: ${(e as Error).message}`);
    }
  }
}
