import { join } from "node:path";
import { existsSync, statSync } from "node:fs";
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

  // ASCII-only filename — strict OPDS clients (Onyx/Xteink) and the Kindle
  // browser reject downloads whose Content-Disposition filename has
  // percent-encoded bytes; they match the extension on the literal string.
  const downloadFilename = `${asciiSlug(book.filename.replace(/\.epub$/i, "")) || "book"}.epub`;

  // Bun.serve uses Transfer-Encoding: chunked when the response body is a
  // Bun.file stream and ignores any Content-Length header we add. Strict
  // OPDS clients (Onyx/Xteink) reject chunked downloads and can't validate
  // against the <link length="…"> declared in the feed. Read the full file
  // into a Uint8Array — Bun then sets Content-Length automatically.
  const stat = statSync(fullPath);
  const bytes = await Bun.file(fullPath).bytes();

  return new Response(bytes, {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${downloadFilename}"`,
      "Last-Modified": new Date(stat.mtimeMs).toUTCString(),
      "Cache-Control": "no-cache",
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
