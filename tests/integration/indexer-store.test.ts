import { describe, expect, test, beforeAll, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/store/store";
import { Indexer } from "../../src/indexer/indexer";

const FIXTURES = join(__dirname, "..", "fixtures");

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe("Indexer + Store", () => {
  let booksDir: string;
  let dataDir: string;
  let store: Store;
  let indexer: Indexer;

  beforeAll(() => {
    if (!existsSync(join(FIXTURES, "valid.epub"))) {
      const r = spawnSync("bun", ["run", "build-fixtures"], { stdio: "inherit" });
      if (r.status !== 0) throw new Error("failed to build fixtures");
    }
  });

  beforeEach(() => {
    booksDir = mkdtempSync(join(tmpdir(), "farenheit-books-"));
    dataDir = mkdtempSync(join(tmpdir(), "farenheit-data-"));
    mkdirSync(join(dataDir, "covers"), { recursive: true });
    store = new Store(join(dataDir, "test.sqlite"));
    indexer = new Indexer({
      booksDir,
      coversDir: join(dataDir, "covers"),
      store,
      skipICloudCheck: true,
    });
  });

  afterEach(async () => {
    await indexer.stop();
    store.close();
    rmSync(booksDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("scanAll indexes root epubs and subfolder epubs with category", async () => {
    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "rootbook.epub"));
    mkdirSync(join(booksDir, "Ficcao"));
    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "Ficcao", "other.epub"));

    await indexer.scanAll();

    const all = store.list({});
    expect(all).toHaveLength(2);
    const root = all.find((b) => b.filename === "rootbook.epub")!;
    expect(root.category).toBeNull();
    expect(root.title).toBe("Valid Title");
    expect(root.coverFilename).not.toBeNull();

    const sub = all.find((b) => b.filename === "other.epub")!;
    expect(sub.category).toBe("Ficcao");
  });

  test("scanAll falls back to filename when no title metadata", async () => {
    copyFileSync(join(FIXTURES, "no-title.epub"), join(booksDir, "anon.epub"));
    await indexer.scanAll();
    const books = store.list({});
    expect(books[0]!.title).toBe("anon.epub");
    expect(books[0]!.author).toBeNull();
  });

  test("scanAll handles corrupted epub without throwing", async () => {
    copyFileSync(join(FIXTURES, "corrupted.epub"), join(booksDir, "bad.epub"));
    await indexer.scanAll();
    const books = store.list({});
    expect(books).toHaveLength(1);
    expect(books[0]!.title).toBe("bad.epub");
    expect(books[0]!.coverFilename).toBeNull();
  });

  test("scanAll is idempotent on unchanged files", async () => {
    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "book.epub"));
    await indexer.scanAll();
    const first = store.list({})[0]!;
    await indexer.scanAll();
    const second = store.list({})[0]!;
    expect(second.id).toBe(first.id);
  });

  test("watch picks up added file and removed file", async () => {
    await indexer.scanAll();
    indexer.watch();
    await wait(300);

    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "new.epub"));
    for (let i = 0; i < 40; i++) {
      if (store.list({}).length === 1) break;
      await wait(150);
    }
    expect(store.list({})).toHaveLength(1);

    unlinkSync(join(booksDir, "new.epub"));
    for (let i = 0; i < 40; i++) {
      if (store.list({}).length === 0) break;
      await wait(150);
    }
    expect(store.list({})).toHaveLength(0);
  });
});
