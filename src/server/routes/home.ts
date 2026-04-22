import { renderHome, type SortKey } from "../templates/home";
import type { Ctx } from "./context";
import type { BookWithDownload } from "../../store/types";
import { escapeHtml } from "../templates/layout";

export function handleHome(ctx: Ctx, url: URL): Response {
  const sort = parseSort(url.searchParams.get("sort"));
  const categories = ctx.store.listCategories();
  const all = ctx.store.list({ sort, deviceId: ctx.deviceId });
  const rootBooks = ctx.store.list({
    category: null,
    deviceId: ctx.deviceId,
    sort,
  });

  const html = renderHome({
    pageTitle: "Farenheit",
    overline: "Biblioteca · iCloud",
    heading: "Farenheit",
    tallyHtml: buildTallyHtml(all),
    sort,
    sortBasePath: "/",
    categories,
    books: rootBooks,
  });
  return htmlResponse(html);
}

export function parseSort(raw: string | null): SortKey {
  if (raw === "title" || raw === "author") return raw;
  return "recent";
}

export function buildTallyHtml(books: BookWithDownload[]): string {
  const total = books.length;
  const unsynced = books.filter((b) => !b.onDisk).length;
  const synced = total - unsynced;
  const totalLabel = `<strong>${total}</strong> ${total === 1 ? "livro" : "livros"}`;
  if (unsynced === 0) return totalLabel;
  return `${totalLabel}<span class="sep">·</span>${synced} sincronizados<span class="sep">·</span>${unsynced} pendentes<a class="retry-link" href="/sync/retry">tentar novamente</a>`;
}

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// Back-compat exports kept for category.ts (sync counts + retry action)
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
  return ` <a class="retry-link" href="/sync/retry">tentar novamente</a>`;
}

// Silence an unused import warning in TS strict mode if callers drop it.
void escapeHtml;
