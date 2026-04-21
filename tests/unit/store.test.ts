import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/store/store";
import type { BookInput } from "../../src/store/types";

function baseBook(overrides: Partial<BookInput> = {}): BookInput {
  return {
    relPath: "livro.epub",
    filename: "livro.epub",
    title: "Livro",
    author: "Autor",
    description: null,
    category: null,
    coverFilename: null,
    sizeBytes: 1024,
    mtime: 1000,
    onDisk: true,
    ...overrides,
  };
}

describe("Store", () => {
  let tmp: string;
  let store: Store;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "farenheit-store-"));
    store = new Store(join(tmp, "test.sqlite"));
  });

  afterEach(() => {
    store.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  test("upsert inserts a new book", () => {
    store.upsert(baseBook());
    const rows = store.list({});
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Livro");
    expect(rows[0]!.id).toBeGreaterThan(0);
  });

  test("upsert updates on same relPath without changing id or addedAt", () => {
    store.upsert(baseBook({ title: "Old" }));
    const firstId = store.list({})[0]!.id;
    const firstAddedAt = store.list({})[0]!.addedAt;

    store.upsert(baseBook({ title: "New", mtime: 2000 }));
    const after = store.list({});
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(firstId);
    expect(after[0]!.addedAt).toBe(firstAddedAt);
    expect(after[0]!.title).toBe("New");
    expect(after[0]!.mtime).toBe(2000);
  });

  test("deleteByRelPath removes book and cascades downloads", () => {
    store.upsert(baseBook());
    const bookId = store.list({})[0]!.id;
    const device = store.ensureDevice("dev-1");
    store.markDownloaded(device.id, bookId);

    store.deleteByRelPath("livro.epub");
    expect(store.list({})).toHaveLength(0);
    store.upsert(baseBook());
    const rowsForDev = store.list({ deviceId: device.id });
    expect(rowsForDev[0]!.downloadedAt).toBeNull();
  });

  test("list filters by category", () => {
    store.upsert(baseBook({ relPath: "a.epub", category: null }));
    store.upsert(baseBook({ relPath: "ficcao/b.epub", category: "ficcao" }));
    store.upsert(baseBook({ relPath: "tecnicos/c.epub", category: "tecnicos" }));

    expect(store.list({ category: null })).toHaveLength(1);
    expect(store.list({ category: "ficcao" })).toHaveLength(1);
    expect(store.list({})).toHaveLength(3);
  });

  test("list search matches title OR author case-insensitively", () => {
    store.upsert(baseBook({ relPath: "a.epub", title: "Dom Casmurro", author: "Machado" }));
    store.upsert(baseBook({ relPath: "b.epub", title: "Sapiens",       author: "Harari" }));
    store.upsert(baseBook({ relPath: "c.epub", title: "Another",       author: "Dom X" }));

    const results = store.list({ search: "dom" });
    expect(results).toHaveLength(2);
  });

  test("list sort defaults to recent (added_at DESC)", () => {
    store.upsert(baseBook({ relPath: "a.epub", title: "A" }));
    const before = Date.now();
    while (Date.now() === before) { /* spin */ }
    store.upsert(baseBook({ relPath: "b.epub", title: "B" }));
    const rows = store.list({});
    expect(rows[0]!.title).toBe("B");
    expect(rows[1]!.title).toBe("A");
  });

  test("listCategories returns names with counts (excludes root)", () => {
    store.upsert(baseBook({ relPath: "a.epub", category: null }));
    store.upsert(baseBook({ relPath: "ficcao/b.epub", category: "ficcao" }));
    store.upsert(baseBook({ relPath: "ficcao/c.epub", category: "ficcao" }));
    store.upsert(baseBook({ relPath: "tecnicos/d.epub", category: "tecnicos" }));

    const cats = store.listCategories();
    expect(cats).toEqual([
      { name: "ficcao",  count: 2 },
      { name: "tecnicos", count: 1 },
    ]);
  });

  test("ensureDevice creates on first call, reuses on second", () => {
    const d1 = store.ensureDevice("uuid-1");
    const d2 = store.ensureDevice("uuid-1");
    expect(d1.id).toBe("uuid-1");
    expect(d2.firstSeenAt).toBe(d1.firstSeenAt);
    expect(d2.lastSeenAt).toBeGreaterThanOrEqual(d1.lastSeenAt);
  });

  test("markDownloaded joins into list for deviceId", () => {
    store.upsert(baseBook({ relPath: "a.epub", title: "A" }));
    store.upsert(baseBook({ relPath: "b.epub", title: "B" }));
    const a = store.list({}).find(b => b.title === "A")!;

    const dev = store.ensureDevice("dev-1");
    store.markDownloaded(dev.id, a.id);

    const withDownload = store.list({ deviceId: dev.id });
    const aRow = withDownload.find(b => b.title === "A")!;
    const bRow = withDownload.find(b => b.title === "B")!;
    expect(aRow.downloadedAt).not.toBeNull();
    expect(bRow.downloadedAt).toBeNull();
  });
});
