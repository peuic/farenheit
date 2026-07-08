import { describe, expect, test } from "bun:test";
import {
  isDatalessPlaceholder,
  ensureMaterialized,
  requestDownload,
  brctlStatus,
  __setRunnerForTests,
} from "../../src/indexer/icloud";

describe("iCloud dataless", () => {
  test("isDatalessPlaceholder true when brctl reports placeholder", async () => {
    __setRunnerForTests(async () => ({ stdout: "isDataless = 1\n", stderr: "", code: 0 }));
    expect(await isDatalessPlaceholder("/x")).toBe(true);
  });

  test("isDatalessPlaceholder false otherwise", async () => {
    __setRunnerForTests(async () => ({ stdout: "isDataless = 0\n", stderr: "", code: 0 }));
    expect(await isDatalessPlaceholder("/x")).toBe(false);
  });

  test("isDatalessPlaceholder false when brctl fails", async () => {
    __setRunnerForTests(async () => ({ stdout: "", stderr: "denied", code: 1 }));
    expect(await isDatalessPlaceholder("/x")).toBe(false);
  });

  test("ensureMaterialized resolves when not dataless", async () => {
    __setRunnerForTests(async () => ({ stdout: "isDataless = 0\n", stderr: "", code: 0 }));
    await ensureMaterialized("/x", 1000);
    expect(true).toBe(true);
  });

  test("ensureMaterialized issues download and polls until not dataless", async () => {
    let calls = 0;
    __setRunnerForTests(async (command, args) => {
      calls++;
      if (command === "brctl" && args[0] === "download") {
        return { stdout: "", stderr: "", code: 0 };
      }
      if (calls <= 2) return { stdout: "isDataless = 1\n", stderr: "", code: 0 };
      return { stdout: "isDataless = 0\n", stderr: "", code: 0 };
    });
    await ensureMaterialized("/x", 2000);
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  test("requestDownload surfaces exit code and stderr for diagnostics", async () => {
    __setRunnerForTests(async () => ({
      stdout: "",
      stderr: "Access denied",
      code: 141,
    }));
    const r = await requestDownload("/x");
    expect(r.code).toBe(141);
    expect(r.stderr).toBe("Access denied");
  });

  test("brctlStatus returns full runner result", async () => {
    __setRunnerForTests(async () => ({
      stdout: "isDataless = 1\n",
      stderr: "warn: item is stub",
      code: 0,
    }));
    const r = await brctlStatus("/x");
    expect(r.stdout).toContain("isDataless");
    expect(r.stderr).toContain("stub");
    expect(r.code).toBe(0);
  });
});
