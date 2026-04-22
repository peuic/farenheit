import { renderHome } from "../templates/home";
import type { Ctx } from "./context";
import type { BookWithDownload } from "../../store/types";

export function handleHome(ctx: Ctx): Response {
  const categories = ctx.store.listCategories();
  const all = ctx.store.list({});
  const rootBooks = ctx.store.list({
    category: null,
    deviceId: ctx.deviceId,
  });
  const html = renderHome({
    pageTitle: "Farenheit",
    heading: "Farenheit",
    subHeading: buildCountSubHeading(all),
    subHeadingActionsHtml: buildRetryActionHtml(all),
    categories,
    books: rootBooks,
  });
  return htmlResponse(html);
}

export function buildCountSubHeading(books: BookWithDownload[]): string {
  const total = books.length;
  const unsynced = books.filter((b) => !b.onDisk).length;
  const synced = total - unsynced;
  const totalLabel = `${total} ${total === 1 ? "livro" : "livros"}`;
  if (unsynced === 0) return totalLabel;
  return `${totalLabel} · ${synced} sincronizados · ${unsynced} pendentes`;
}

export function buildRetryActionHtml(books: BookWithDownload[]): string {
  const hasUnsynced = books.some((b) => !b.onDisk);
  if (!hasUnsynced) return "";
  return ` <a class="retry-link" href="/sync/retry">↻ tentar sincronizar</a>`;
}

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
