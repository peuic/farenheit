import { renderHome } from "../templates/home";
import type { Ctx } from "./context";

export function handleHome(ctx: Ctx): Response {
  const categories = ctx.store.listCategories();
  const totalBooks = ctx.store.list({}).length;
  const rootBooks = ctx.store.list({
    category: null,
    deviceId: ctx.deviceId,
    limit: 50,
  });
  const html = renderHome({
    pageTitle: "Farenheit",
    heading: "Farenheit",
    subHeading: `${totalBooks} ${totalBooks === 1 ? "livro" : "livros"}`,
    categories,
    books: rootBooks,
  });
  return htmlResponse(html);
}

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
