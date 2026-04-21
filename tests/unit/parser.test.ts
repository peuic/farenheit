import { describe, expect, test, beforeAll } from "bun:test";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { parseEpub } from "../../src/indexer/parser";

const FIXTURES = join(__dirname, "..", "fixtures");

describe("parseEpub", () => {
  beforeAll(() => {
    if (!existsSync(join(FIXTURES, "valid.epub"))) {
      const r = spawnSync("bun", ["run", "build-fixtures"], { stdio: "inherit" });
      if (r.status !== 0) throw new Error("failed to build fixtures");
    }
  });

  test("extracts title, author, description from valid.epub", async () => {
    const r = await parseEpub(join(FIXTURES, "valid.epub"));
    expect(r.title).toBe("Valid Title");
    expect(r.author).toBe("Valid Author");
    expect(r.description).toBe("A valid test description.");
    expect(r.cover).not.toBeNull();
    expect(r.cover!.mimeType).toBe("image/png");
    expect(r.cover!.data.byteLength).toBeGreaterThan(0);
  });

  test("returns null cover for no-cover.epub", async () => {
    const r = await parseEpub(join(FIXTURES, "no-cover.epub"));
    expect(r.title).toBe("Valid Title");
    expect(r.cover).toBeNull();
  });

  test("returns null title/author when metadata missing", async () => {
    const r = await parseEpub(join(FIXTURES, "no-title.epub"));
    expect(r.title).toBeNull();
    expect(r.author).toBeNull();
  });

  test("throws on corrupted epub", async () => {
    await expect(parseEpub(join(FIXTURES, "corrupted.epub"))).rejects.toThrow();
  });
});
