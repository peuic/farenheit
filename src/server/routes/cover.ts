import { join } from "node:path";
import { existsSync } from "node:fs";
import { renderNotFound } from "../templates/notFound";
import { htmlResponse } from "./home";
import type { Ctx } from "./context";

export function handleCover(ctx: Ctx, idStr: string): Response {
  const id = Number.parseInt(idStr, 10);
  if (Number.isNaN(id)) return htmlResponse(renderNotFound(), 404);
  const book = ctx.store.getById(id);
  if (!book || !book.coverFilename) return new Response("no cover", { status: 404 });

  const path = join(ctx.config.coversDir, book.coverFilename);
  if (!existsSync(path)) return new Response("missing cover file", { status: 404 });

  return new Response(Bun.file(path), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=2592000, immutable",
    },
  });
}
