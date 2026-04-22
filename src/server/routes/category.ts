import { renderHome } from "../templates/home";
import { htmlResponse, buildTallyHtml, parseSort } from "./home";
import type { Ctx } from "./context";

export function handleCategory(ctx: Ctx, categoryName: string, url: URL): Response {
  const sort = parseSort(url.searchParams.get("sort"));
  const books = ctx.store.list({
    category: categoryName,
    deviceId: ctx.deviceId,
    sort,
  });
  const html = renderHome({
    pageTitle: `${categoryName} — Farenheit`,
    overline: "Categoria",
    heading: categoryName,
    tallyHtml: buildTallyHtml(books),
    sort,
    sortBasePath: `/c/${encodeURIComponent(categoryName)}`,
    books,
    backHref: "/",
  });
  return htmlResponse(html);
}
