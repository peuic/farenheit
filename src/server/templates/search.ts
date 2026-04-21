import { escapeHtml, layout } from "./layout";
import { renderHome } from "./home";
import type { BookWithDownload } from "../../store/types";

export function renderSearchPage(query: string, results: BookWithDownload[]): string {
  const form = `
<div class="nav">
  <a href="/">← Voltar</a>
  <span>Buscar</span>
</div>
<form class="search" method="get" action="/search">
  <input type="text" name="q" value="${escapeHtml(query)}" placeholder="título ou autor" autofocus>
  <button type="submit">Buscar</button>
</form>
`;

  if (!query) {
    return layout("Buscar — Farenheit", form);
  }

  const resultsDoc = renderHome({
    pageTitle: `Busca: ${query}`,
    heading: `Resultados para "${query}"`,
    subHeading: `${results.length} ${results.length === 1 ? "livro" : "livros"}`,
    books: results,
    backHref: undefined,
  });

  const bodyMatch = resultsDoc.match(/<body>([\s\S]*?)<\/body>/);
  const bodyInner = bodyMatch ? bodyMatch[1]! : "";
  const withoutNav = bodyInner.replace(/<div class="nav">[\s\S]*?<\/div>\s*/, "");

  return layout(`Busca: ${query}`, form + withoutNav);
}
