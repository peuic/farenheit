import { renderHome } from "../templates/home";
import { htmlResponse, buildCountSubHeading } from "./home";
import type { Ctx } from "./context";

export function handleCategory(ctx: Ctx, categoryName: string): Response {
  const books = ctx.store.list({
    category: categoryName,
    deviceId: ctx.deviceId,
  });
  const html = renderHome({
    pageTitle: `${categoryName} — Farenheit`,
    heading: categoryName,
    subHeading: buildCountSubHeading(books),
    books,
    backHref: "/",
  });
  return htmlResponse(html);
}
