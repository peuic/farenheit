import { renderSearchPage } from "../templates/search";
import { htmlResponse, parsePage } from "./home";
import { PAGE_SIZE } from "../templates/home";
import type { Ctx } from "./context";

export function handleSearch(ctx: Ctx, url: URL): Response {
  const q = (url.searchParams.get("q") ?? "").trim();
  const rawPage = parsePage(url.searchParams.get("page"));

  const results = q
    ? ctx.store.list({ search: q, deviceId: ctx.deviceId })
    : [];

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, rawPage), totalPages);
  const offset = (page - 1) * PAGE_SIZE;
  const pageResults = q ? results.slice(offset, offset + PAGE_SIZE) : [];

  return htmlResponse(renderSearchPage(q, pageResults, results.length, page, totalPages));
}
