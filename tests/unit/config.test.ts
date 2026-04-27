import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { loadConfig } from "../../src/config";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "farenheit-cfg-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("throws when BOOKS_DIR is missing", () => {
    expect(() => loadConfig({})).toThrow(/BOOKS_DIR/);
  });

  test("throws when BOOKS_DIR does not exist", () => {
    expect(() => loadConfig({ BOOKS_DIR: "/no/such/path/abc123" })).toThrow(/not found/i);
  });

  test("returns full config with defaults", () => {
    const cfg = loadConfig({ BOOKS_DIR: tmpDir });
    expect(cfg.booksDir).toBe(tmpDir);
    expect(cfg.port).toBe(1111);
    expect(cfg.host).toBe("0.0.0.0");
    expect(cfg.dataDir.endsWith("data")).toBe(true);
    expect(cfg.dbPath.endsWith("farenheit.sqlite")).toBe(true);
    expect(cfg.coversDir.endsWith("covers")).toBe(true);
  });

  test("env overrides apply", () => {
    const cfg = loadConfig({
      BOOKS_DIR: tmpDir,
      PORT: "2222",
      HOST: "127.0.0.1",
      DATA_DIR: tmpDir,
    });
    expect(cfg.port).toBe(2222);
    expect(cfg.host).toBe("127.0.0.1");
    expect(cfg.dataDir).toBe(tmpDir);
  });

  test("auth is null by default", () => {
    const cfg = loadConfig({ BOOKS_DIR: tmpDir });
    expect(cfg.auth).toBeNull();
  });

  test("auth requires both user AND pass to activate", () => {
    expect(loadConfig({ BOOKS_DIR: tmpDir, FARENHEIT_USER: "x" }).auth).toBeNull();
    expect(loadConfig({ BOOKS_DIR: tmpDir, FARENHEIT_PASS: "y" }).auth).toBeNull();
    expect(
      loadConfig({ BOOKS_DIR: tmpDir, FARENHEIT_USER: "x", FARENHEIT_PASS: "y" }).auth,
    ).toEqual({ user: "x", pass: "y" });
  });
});
