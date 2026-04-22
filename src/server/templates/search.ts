import { escapeHtml, layout } from "./layout";
import type { BookWithDownload } from "../../store/types";

export function renderSearchPage(query: string, results: BookWithDownload[]): string {
  const form = `
<nav class="nav" aria-label="Navegação">
  <a class="back" href="/">voltar</a>
  <a href="/">Farenheit</a>
</nav>
<section class="title-block">
  <div class="overline">Buscar</div>
  <h1>título ou autor</h1>
</section>
<form class="search" method="get" action="/search">
  <input type="text" name="q" value="${escapeHtml(query)}" placeholder="digite aqui…" autofocus>
  <button type="submit">Buscar</button>
</form>
`;

  if (!query) {
    return layout("Buscar — Farenheit", form);
  }

  const resultsBlock = results.length
    ? `<div class="tally"><strong>${results.length}</strong> ${results.length === 1 ? "resultado" : "resultados"}</div>
       <ul class="book-list" style="margin-top:18px">
         ${results.map(renderResultItem).join("")}
       </ul>`
    : `<div class="empty">Nenhum livro com “${escapeHtml(query)}”.</div>`;

  return layout(`Busca: ${query}`, form + resultsBlock);
}

function renderResultItem(b: BookWithDownload): string {
  const coverHtml = b.coverFilename
    ? `<img class="cover" src="/book/${b.id}/cover?v=${b.mtime}" alt="" loading="lazy" width="44" height="66">`
    : `<div class="cover placeholder">sem capa</div>`;
  const authorHtml = b.author ? `<div class="author">${escapeHtml(b.author)}</div>` : "";
  const classes = [
    b.downloadedAt ? "downloaded" : "",
    !b.onDisk ? "unsynced" : "",
  ].filter(Boolean).join(" ");
  return `
<li class="${classes}">
  <span class="marker" aria-hidden="true"></span>
  <a href="/book/${b.id}">
    ${coverHtml}
    <div class="meta">
      <div class="title">${escapeHtml(b.title)}</div>
      ${authorHtml}
    </div>
  </a>
</li>`;
}
