import { describe, expect, test, beforeAll, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "bun";

import { loadConfig } from "../../src/config";
import { Store } from "../../src/store/store";
import { Indexer } from "../../src/indexer/indexer";
import { startServer } from "../../src/server/server";

const FIXTURES = join(__dirname, "..", "fixtures");

function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

describe("E2E — full flow", () => {
  let booksDir: string;
  let dataDir: string;
  let store: Store;
  let indexer: Indexer;
  let server: Server;
  let baseUrl: string;

  beforeAll(() => {
    if (!existsSync(join(FIXTURES, "valid.epub"))) {
      const r = spawnSync("bun", ["run", "build-fixtures"], { stdio: "inherit" });
      if (r.status !== 0) throw new Error("failed to build fixtures");
    }
  });

  beforeEach(async () => {
    booksDir = mkdtempSync(join(tmpdir(), "farenheit-e2e-books-"));
    dataDir = mkdtempSync(join(tmpdir(), "farenheit-e2e-data-"));
    mkdirSync(join(dataDir, "covers"), { recursive: true });

    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "one.epub"));
    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "two.epub"));
    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "three.epub"));

    const config = loadConfig({
      BOOKS_DIR: booksDir,
      DATA_DIR: dataDir,
      PORT: "0",
      HOST: "127.0.0.1",
    });
    store = new Store(config.dbPath);
    indexer = new Indexer({
      booksDir: config.booksDir,
      coversDir: config.coversDir,
      store,
      skipICloudCheck: true,
    });
    await indexer.scanAll();
    indexer.watch();

    server = startServer({ config, store, skipICloudCheckOnDownload: true });
    baseUrl = `http://${server.hostname}:${server.port}`;
    await wait(200);
  });

  afterEach(async () => {
    server.stop(true);
    await indexer.stop();
    store.close();
    rmSync(booksDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("full flow: list, download, mark, reload, add file", async () => {
    let r = await fetch(baseUrl);
    let body = await r.text();
    expect(body).toContain(">3</strong> books");

    const first = store.list({})[0]!;
    r = await fetch(`${baseUrl}/book/${first.id}/download`);
    expect(r.status).toBe(200);
    const cookie = r.headers.get("set-cookie")!.split(";")[0]!;

    r = await fetch(baseUrl, { headers: { cookie } });
    body = await r.text();
    expect(body).toContain("downloaded");

    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "four.epub"));
    for (let i = 0; i < 40; i++) {
      const list = store.list({});
      if (list.length === 4) break;
      await wait(150);
    }
    expect(store.list({})).toHaveLength(4);

    r = await fetch(baseUrl, { headers: { cookie } });
    body = await r.text();
    expect(body).toContain(">4</strong> books");
  });
});
