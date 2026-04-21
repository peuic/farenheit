import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { processCover, COVER_MAX_WIDTH } from "../../src/indexer/cover";

describe("processCover", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "farenheit-cover-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("resizes large image to max width and writes webp", async () => {
    const big = await sharp({
      create: { width: 1200, height: 1800, channels: 3, background: { r: 120, g: 40, b: 40 } },
    }).png().toBuffer();

    const dest = join(tmp, "1.webp");
    await processCover(big, dest);

    expect(existsSync(dest)).toBe(true);
    const meta = await sharp(dest).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(COVER_MAX_WIDTH);
  });

  test("does not upscale small images", async () => {
    const small = await sharp({
      create: { width: 100, height: 150, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).png().toBuffer();

    const dest = join(tmp, "2.webp");
    await processCover(small, dest);

    const meta = await sharp(dest).metadata();
    expect(meta.width).toBe(100);
  });

  test("throws on invalid image buffer", async () => {
    const dest = join(tmp, "3.webp");
    await expect(processCover(Buffer.from("not an image"), dest)).rejects.toThrow();
    expect(existsSync(dest)).toBe(false);
  });
});
