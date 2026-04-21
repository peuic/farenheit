import { renderSearchPage } from "../templates/search";
import { htmlResponse } from "./home";
import type { Ctx } from "./context";

export function handleSearch(ctx: Ctx, query: string): Response {
  const q = query.trim();
  const results = q
    ? ctx.store.list({ search: q, deviceId: ctx.deviceId })
    : [];
  return htmlResponse(renderSearchPage(q, results));
}
