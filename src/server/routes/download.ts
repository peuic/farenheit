import { join } from "node:path";
import { existsSync } from "node:fs";
import { renderNotFound } from "../templates/notFound";
import { htmlResponse } from "./home";
import { ensureMaterialized } from "../../indexer/icloud";
import type { Ctx } from "./context";

export async function handleDownload(ctx: Ctx, idStr: string): Promise<Response> {
  const id = Number.parseInt(idStr, 10);
  if (Number.isNaN(id)) return htmlResponse(renderNotFound(), 404);

  const book = ctx.store.getById(id);
  if (!book) return htmlResponse(renderNotFound(), 404);

  const fullPath = join(ctx.config.booksDir, book.relPath);
  if (!existsSync(fullPath)) {
    return new Response("file not found on disk", { status: 410 });
  }

  if (!ctx.skipICloudCheckOnDownload) {
    try {
      await ensureMaterialized(fullPath, 60_000);
    } catch (e) {
      return new Response(`iCloud download failed: ${(e as Error).message}`, { status: 503 });
    }
  }

  ctx.store.markDownloaded(ctx.deviceId, book.id);

  // Strict OPDS clients (Onyx/Xteink) and the Kindle browser both reject
  // downloads whose Content-Disposition filename contains percent-encoded
  // bytes — they look at the literal string for the extension. Reduce to
  // pure ASCII (same logic used for the MOBI route).
  const downloadFilename = `${asciiSlug(book.filename.replace(/\.epub$/i, "")) || "book"}.epub`;

  return new Response(Bun.file(fullPath), {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${downloadFilename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function asciiSlug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.-]+|[_.-]+$/g, "");
}
