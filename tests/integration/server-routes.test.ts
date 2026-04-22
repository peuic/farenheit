import { describe, expect, test, beforeAll, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/store/store";
import { Indexer } from "../../src/indexer/indexer";
import { startServer } from "../../src/server/server";
import type { Server } from "bun";

const FIXTURES = join(__dirname, "..", "fixtures");

describe("server routes", () => {
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
    booksDir = mkdtempSync(join(tmpdir(), "farenheit-books-"));
    dataDir = mkdtempSync(join(tmpdir(), "farenheit-data-"));
    const coversDir = join(dataDir, "covers");
    mkdirSync(coversDir, { recursive: true });

    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "root-book.epub"));
    mkdirSync(join(booksDir, "Ficcao"));
    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "Ficcao", "sub-book.epub"));

    store = new Store(join(dataDir, "test.sqlite"));
    indexer = new Indexer({ booksDir, coversDir, store, skipICloudCheck: true });
    await indexer.scanAll();

    const config = {
      booksDir,
      dataDir,
      dbPath: join(dataDir, "test.sqlite"),
      coversDir,
      logPath: join(dataDir, "test.log"),
      port: 0,
      host: "127.0.0.1",
    };
    server = startServer({ config, store, skipICloudCheckOnDownload: true });
    baseUrl = `http://${server.hostname}:${server.port}`;
  });

  afterEach(async () => {
    server.stop(true);
    await indexer.stop();
    store.close();
    rmSync(booksDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("GET / returns HTML with books and category", async () => {
    const r = await fetch(baseUrl);
    const body = await r.text();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("Farenheit");
    expect(body).toContain("Ficcao");
  });

  test("GET / sets device cookie on first visit", async () => {
    const r = await fetch(baseUrl);
    const setCookie = r.headers.get("set-cookie");
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain("fh_device=");
  });

  test("GET /c/:category lists only that category", async () => {
    const r = await fetch(`${baseUrl}/c/Ficcao`);
    const body = await r.text();
    expect(r.status).toBe(200);
    expect(body).toContain("Ficcao");
    expect(body).not.toContain("Nenhum livro por aqui");
  });

  test("GET /book/:id returns detail with Baixar button", async () => {
    const first = store.list({})[0]!;
    const r = await fetch(`${baseUrl}/book/${first.id}`);
    const body = await r.text();
    expect(r.status).toBe(200);
    expect(body).toContain("Baixar no Kobo");
  });

  test("GET /book/:id/download returns epub bytes and marks downloaded", async () => {
    const first = store.list({})[0]!;
    const r = await fetch(`${baseUrl}/book/${first.id}/download`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/epub+zip");
    const buf = await r.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);

    const setCookie = r.headers.get("set-cookie");
    expect(setCookie).not.toBeNull();
    const cookieHeader = setCookie!.split(";")[0]!;
    const r2 = await fetch(baseUrl, { headers: { cookie: cookieHeader } });
    const body2 = await r2.text();
    expect(body2).toContain("downloaded");
  });

  test("GET /search?q=... returns filtered results", async () => {
    const r = await fetch(`${baseUrl}/search?q=Valid`);
    const body = await r.text();
    expect(r.status).toBe(200);
    expect(body).toContain("Valid Title");
  });

  test("GET /does-not-exist returns 404", async () => {
    const r = await fetch(`${baseUrl}/no-such-path`);
    expect(r.status).toBe(404);
  });

  test("GET /book/:id/cover returns jpeg", async () => {
    const first = store.list({})[0]!;
    const r = await fetch(`${baseUrl}/book/${first.id}/cover?v=${first.mtime}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
  });
});
