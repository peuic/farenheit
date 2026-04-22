import { renderBook } from "../templates/book";
import { renderNotFound } from "../templates/notFound";
import { htmlResponse } from "./home";
import type { Ctx } from "./context";

export function handleBook(ctx: Ctx, idStr: string): Response {
  const id = Number.parseInt(idStr, 10);
  if (Number.isNaN(id)) return htmlResponse(renderNotFound(), 404);
  const book = ctx.store.getById(id);
  if (!book) return htmlResponse(renderNotFound(), 404);

  const listed = ctx.store.list({ deviceId: ctx.deviceId });
  const withDl = listed.find((b) => b.id === id) ?? book;

  const backHref = book.category ? `/c/${encodeURIComponent(book.category)}` : "/";
  const mobiAvailable = ctx.config.ebookConvertPath !== null;
  return htmlResponse(renderBook(withDl, backHref, mobiAvailable));
}
