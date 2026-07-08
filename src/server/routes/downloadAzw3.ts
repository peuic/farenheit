import { join } from "node:path";
import { existsSync, statSync } from "node:fs";
import { renderNotFound } from "../templates/notFound";
import { htmlResponse } from "./home";
import { convertEpubToAzw3 } from "../../converter";
import { ensureMaterialized } from "../../indexer/icloud";
import type { Ctx } from "./context";

export async function handleDownloadAzw3(ctx: Ctx, idStr: string): Promise<Response> {
  const id = Number.parseInt(idStr, 10);
  if (Number.isNaN(id)) return htmlResponse(renderNotFound(), 404);

  const book = ctx.store.getById(id);
  if (!book) return htmlResponse(renderNotFound(), 404);

  if (!ctx.config.ebookConvertPath) {
    return new Response(
      "AZW3 conversion unavailable — install the Calibre desktop app.",
      { status: 503 },
    );
  }

  const epubPath = join(ctx.config.booksDir, book.relPath);
  if (!existsSync(epubPath)) {
    return new Response("file not found on disk", { status: 410 });
  }

  if (!ctx.skipICloudCheckOnDownload) {
    try {
      await ensureMaterialized(epubPath, 60_000);
    } catch (e) {
      return new Response(`iCloud download failed: ${(e as Error).message}`, { status: 503 });
    }
  }

  // Cache file keyed by id + mtime so an updated epub triggers a fresh AZW3.
  const azw3Name = `${book.id}.${book.mtime}.azw3`;
  const azw3Path = join(ctx.config.azw3CacheDir, azw3Name);

  try {
    await convertEpubToAzw3(ctx.config.ebookConvertPath, epubPath, azw3Path);
  } catch (e) {
    console.warn(`[azw3] conversion failed for ${book.relPath}: ${(e as Error).message}`);
    return new Response(`conversion failed: ${(e as Error).message}`, { status: 500 });
  }

  ctx.store.markDownloaded(ctx.deviceId, book.id);

  // Kindle's experimental browser only accepts downloads whose Content-
  // Disposition filename literally ends in a recognized extension —
  // percent-encoded non-ASCII characters confuse its extension check.
  // Reduce to pure ASCII.
  const downloadFilename = `${asciiSlug(book.filename.replace(/\.epub$/i, "")) || "book"}.azw3`;
  const stat = statSync(azw3Path);
  // Read fully into memory — Bun sends chunked when given a file stream.
  const bytes = await Bun.file(azw3Path).bytes();
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/vnd.amazon.ebook",
      "Content-Disposition": `attachment; filename="${downloadFilename}"`,
      "Last-Modified": new Date(stat.mtimeMs).toUTCString(),
      "Cache-Control": "no-cache",
    },
  });
}

function asciiSlug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // strip diacritics
    .replace(/[^a-zA-Z0-9._-]+/g, "_") // non-ASCII / punctuation → _
    .replace(/_+/g, "_")
    .replace(/^[_.-]+|[_.-]+$/g, "");
}
