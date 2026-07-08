import { renderBook } from "../templates/book";
import { renderNotFound } from "../templates/notFound";
import { htmlResponse } from "./home";
import type { Ctx } from "./context";

// A `?back=` value must be a same-origin path so the back link can never
// redirect the user off-site. Reject anything that doesn't start with a
// single slash (rules out protocol-relative `//host` and absolute URLs),
// and cap the length to keep crafted URLs from blowing up the page.
function safeBackHref(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.length > 256) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("\\")) return null;
  return raw;
}

export function handleBook(ctx: Ctx, idStr: string, url: URL): Response {
  const id = Number.parseInt(idStr, 10);
  if (Number.isNaN(id)) return htmlResponse(renderNotFound(), 404);
  const book = ctx.store.getById(id);
  if (!book) return htmlResponse(renderNotFound(), 404);

  const listed = ctx.store.list({ deviceId: ctx.deviceId });
  const withDl = listed.find((b) => b.id === id) ?? book;

  const fallbackBack = book.category ? `/c/${encodeURIComponent(book.category)}` : "/";
  const backHref = safeBackHref(url.searchParams.get("back")) ?? fallbackBack;
  const azw3Available = ctx.config.ebookConvertPath !== null;
  return htmlResponse(renderBook(withDl, backHref, azw3Available));
}
