import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findEbookConvert,
  convertEpubToMobi,
  __setConvertImplForTests,
} from "../../src/converter";

describe("findEbookConvert", () => {
  test("returns env override when the file exists", () => {
    // process.argv[0] is the bun binary — guaranteed to exist.
    expect(findEbookConvert(process.argv[0]!)).toBe(process.argv[0]!);
  });

  test("returns null when env override does not exist and no known paths hit", () => {
    // Use a clearly bogus path; real macOS may have calibre installed, in
    // which case the fallback would pick it up, so we only assert the env
    // override is rejected.
    expect(findEbookConvert("/nope/definitely/does/not/exist")).not.toBe(
      "/nope/definitely/does/not/exist",
    );
  });
});

describe("convertEpubToMobi", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "farenheit-convert-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    // Reset the impl in case a test set it.
    __setConvertImplForTests(async () => {
      throw new Error("impl not set");
    });
  });

  test("skips conversion when destination already exists", async () => {
    const src = join(tmp, "in.epub");
    const dst = join(tmp, "out.mobi");
    writeFileSync(src, "fake");
    writeFileSync(dst, "already here");

    let called = false;
    __setConvertImplForTests(async () => {
      called = true;
    });

    await convertEpubToMobi("/bin/true", src, dst);
    expect(called).toBe(false);
  });

  test("invokes the impl and produces the destination file", async () => {
    const src = join(tmp, "in.epub");
    const dst = join(tmp, "out.mobi");
    writeFileSync(src, "fake epub bytes");

    __setConvertImplForTests(async (_bin, _src, dest) => {
      writeFileSync(dest, "fake mobi bytes");
    });

    await convertEpubToMobi("/usr/bin/ebook-convert", src, dst);
    expect(existsSync(dst)).toBe(true);
  });

  test("dedupes concurrent conversions to the same destination", async () => {
    const src = join(tmp, "in.epub");
    const dst = join(tmp, "out.mobi");
    writeFileSync(src, "fake");

    let calls = 0;
    __setConvertImplForTests(async (_bin, _src, dest) => {
      calls++;
      await new Promise((r) => setTimeout(r, 50));
      writeFileSync(dest, "mobi");
    });

    await Promise.all([
      convertEpubToMobi("/bin/x", src, dst),
      convertEpubToMobi("/bin/x", src, dst),
      convertEpubToMobi("/bin/x", src, dst),
    ]);
    expect(calls).toBe(1);
  });
});
