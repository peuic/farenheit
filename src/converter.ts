import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Known install paths for Calibre's CLI on macOS, in priority order.
const KNOWN_EBOOK_CONVERT_PATHS = [
  "/Applications/calibre.app/Contents/MacOS/ebook-convert",
  "/opt/homebrew/bin/ebook-convert",
  "/usr/local/bin/ebook-convert",
];

/**
 * Resolve the `ebook-convert` binary. An explicit env override takes priority;
 * otherwise the standard macOS install paths are tried. Returns `null` when
 * no binary is available — the server treats that as "no AZW3 export".
 */
export function findEbookConvert(envOverride?: string | undefined): string | null {
  if (envOverride && existsSync(envOverride)) return envOverride;
  for (const p of KNOWN_EBOOK_CONVERT_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

// ——— Conversion ———
// Deduplicate concurrent conversions of the same destination so that two
// clients asking for the same AZW3 don't kick off two `ebook-convert`
// processes in parallel.
const inflight = new Map<string, Promise<void>>();

type ConvertImpl = (bin: string, src: string, dest: string) => Promise<void>;

async function defaultConvertImpl(bin: string, src: string, dest: string): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true });
  // Output extension `.azw3` makes Calibre emit a KF8 container with the
  // native Amazon AZW3 wrapper. Kindle's library indexer treats sideloaded
  // .azw3 files the same way it treats Amazon-store downloads (covers show
  // up reliably, books open without "is this a purchased item?" warnings).
  // The legacy `.mobi` output we used before sometimes triggered Kindle's
  // DRM check on the same KF8 bytes.
  await new Promise<void>((resolve, reject) => {
    const p = spawn(bin, [src, dest], { shell: false });
    p.stdout.on("data", () => {});
    p.stderr.on("data", () => {});
    p.on("close", (code) => {
      if (code === 0 && existsSync(dest)) resolve();
      else reject(new Error(`ebook-convert exited with code ${code}`));
    });
    p.on("error", reject);
  });
}

let convertImpl: ConvertImpl = defaultConvertImpl;
export function __setConvertImplForTests(fn: ConvertImpl): void {
  convertImpl = fn;
}

export async function convertEpubToAzw3(
  ebookConvertPath: string,
  srcEpub: string,
  destAzw3: string,
): Promise<void> {
  if (existsSync(destAzw3)) return;
  const existing = inflight.get(destAzw3);
  if (existing) return existing;

  const promise = convertImpl(ebookConvertPath, srcEpub, destAzw3);
  inflight.set(destAzw3, promise);
  try {
    await promise;
  } finally {
    inflight.delete(destAzw3);
  }
}
