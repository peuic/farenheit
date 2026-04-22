import { existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { findEbookConvert } from "./converter";

export type Config = {
  booksDir: string;
  dataDir: string;
  dbPath: string;
  coversDir: string;
  mobiCacheDir: string;
  logPath: string;
  port: number;
  host: string;
  ebookConvertPath: string | null;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const booksDir = env.BOOKS_DIR;
  if (!booksDir) {
    throw new Error("BOOKS_DIR env var is required");
  }
  if (!existsSync(booksDir) || !statSync(booksDir).isDirectory()) {
    throw new Error(`BOOKS_DIR not found or not a directory: ${booksDir}`);
  }

  const dataDir = resolve(env.DATA_DIR ?? "./data");
  mkdirSync(dataDir, { recursive: true });
  const coversDir = join(dataDir, "covers");
  mkdirSync(coversDir, { recursive: true });
  const mobiCacheDir = join(dataDir, "mobi-cache");
  mkdirSync(mobiCacheDir, { recursive: true });

  const portStr = env.PORT ?? "1111";
  const port = Number.parseInt(portStr, 10);
  if (Number.isNaN(port) || port < 0 || port > 65535) {
    throw new Error(`invalid PORT: ${portStr}`);
  }

  const ebookConvertPath = findEbookConvert(env.EBOOK_CONVERT);

  return {
    booksDir: resolve(booksDir),
    dataDir,
    dbPath: join(dataDir, "farenheit.sqlite"),
    coversDir,
    mobiCacheDir,
    logPath: join(dataDir, "farenheit.log"),
    port,
    host: env.HOST ?? "0.0.0.0",
    ebookConvertPath,
  };
}
