import { join } from "node:path";
import { existsSync } from "node:fs";
import { renderNotFound } from "../templates/notFound";
import { htmlResponse } from "./home";
import { convertEpubToMobi } from "../../converter";
import { ensureMaterialized } from "../../indexer/icloud";
import type { Ctx } from "./context";

export async function handleDownloadMobi(ctx: Ctx, idStr: string): Promise<Response> {
  const id = Number.parseInt(idStr, 10);
  if (Number.isNaN(id)) return htmlResponse(renderNotFound(), 404);

  const book = ctx.store.getById(id);
  if (!book) return htmlResponse(renderNotFound(), 404);

  if (!ctx.config.ebookConvertPath) {
    return new Response(
      "MOBI conversion unavailable — install the Calibre desktop app.",
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

  // Cache file keyed by id + mtime so an updated epub triggers a fresh MOBI.
  const mobiName = `${book.id}.${book.mtime}.mobi`;
  const mobiPath = join(ctx.config.mobiCacheDir, mobiName);

  try {
    await convertEpubToMobi(ctx.config.ebookConvertPath, epubPath, mobiPath);
  } catch (e) {
    console.warn(`[mobi] conversion failed for ${book.relPath}: ${(e as Error).message}`);
    return new Response(`conversion failed: ${(e as Error).message}`, { status: 500 });
  }

  ctx.store.markDownloaded(ctx.deviceId, book.id);

  const downloadFilename = book.filename.replace(/\.epub$/i, ".mobi");
  return new Response(Bun.file(mobiPath), {
    headers: {
      "Content-Type": "application/x-mobipocket-ebook",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(downloadFilename)}"`,
      "Cache-Control": "no-store",
    },
  });
}
