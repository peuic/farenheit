import {
  renderHome,
  PAGE_SIZE,
  buildLetterIndex,
  type SortKey,
} from "../templates/home";
import type { Ctx } from "./context";
import type { BookWithDownload } from "../../store/types";

export function handleHome(ctx: Ctx, url: URL): Response {
  const sort = parseSort(url.searchParams.get("sort"));
  const rawPage = parsePage(url.searchParams.get("page"));

  const allBooks = ctx.store.list({ sort, deviceId: ctx.deviceId });

  const totalPages = Math.max(1, Math.ceil(allBooks.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, rawPage), totalPages);
  const offset = (page - 1) * PAGE_SIZE;
  const pageBooks = allBooks.slice(offset, offset + PAGE_SIZE);

  const letterIndex = sort === "title"
    ? buildLetterIndex(allBooks, PAGE_SIZE, (b) => b.title)
    : sort === "author"
      ? buildLetterIndex(allBooks, PAGE_SIZE, (b) => b.author ?? b.title)
      : null;

  const html = renderHome({
    pageTitle: "Farenheit",
    heading: "",
    tallyHtml: buildTallyHtml(allBooks),
    sort,
    sortBasePath: "/",
    books: pageBooks,
    page,
    totalPages,
    letterIndex,
  });
  return htmlResponse(html);
}

export function parseSort(raw: string | null): SortKey {
  if (raw === "title" || raw === "author") return raw;
  return "recent";
}

export function parsePage(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isNaN(n) || n < 1 ? 1 : n;
}

export function buildTallyHtml(books: BookWithDownload[]): string {
  const total = books.length;
  const unsynced = books.filter((b) => !b.onDisk).length;
  const totalLabel = `<strong>${total}</strong> ${total === 1 ? "book" : "books"}`;
  if (unsynced === 0) return totalLabel;
  return `${totalLabel} · ${unsynced} pending <a class="retry" href="/sync/retry" aria-label="Retry sync">↻</a>`;
}

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // HTML is cheap to re-render and the UI is evolving fast — never cache.
      // Avoids Safari/Kobo serving stale markup after a redeploy.
      "Cache-Control": "no-store, must-revalidate",
      "Pragma": "no-cache",
    },
  });
}
