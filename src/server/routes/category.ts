import {
  renderHome,
  PAGE_SIZE,
  buildLetterIndex,
} from "../templates/home";
import { htmlResponse, buildTallyHtml, parseSort, parsePage } from "./home";
import type { Ctx } from "./context";

export function handleCategory(ctx: Ctx, categoryName: string, url: URL): Response {
  const sort = parseSort(url.searchParams.get("sort"));
  const rawPage = parsePage(url.searchParams.get("page"));

  const books = ctx.store.list({
    category: categoryName,
    deviceId: ctx.deviceId,
    sort,
  });

  const totalPages = Math.max(1, Math.ceil(books.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, rawPage), totalPages);
  const offset = (page - 1) * PAGE_SIZE;
  const pageBooks = books.slice(offset, offset + PAGE_SIZE);

  const basePath = `/c/${encodeURIComponent(categoryName)}`;

  const letterIndex = sort === "title"
    ? buildLetterIndex(books, PAGE_SIZE, (b) => b.title)
    : sort === "author"
      ? buildLetterIndex(books, PAGE_SIZE, (b) => b.author ?? b.title)
      : null;

  const html = renderHome({
    pageTitle: `${categoryName} — Farenheit`,
    overline: "Categoria",
    heading: categoryName,
    tallyHtml: buildTallyHtml(books),
    sort,
    sortBasePath: basePath,
    books: pageBooks,
    page,
    totalPages,
    letterIndex,
    backHref: "/",
  });
  return htmlResponse(html);
}
