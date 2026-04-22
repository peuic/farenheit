import { escapeHtml, layout } from "./layout";
import type { BookWithDownload } from "../../store/types";

export function renderSearchPage(
  query: string,
  pageResults: BookWithDownload[],
  totalResults: number,
  page: number,
  totalPages: number,
): string {
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

  const resultsBlock = totalResults === 0
    ? `<div class="empty">Nenhum livro com “${escapeHtml(query)}”.</div>`
    : `<div class="tally"><strong>${totalResults}</strong> ${totalResults === 1 ? "resultado" : "resultados"}</div>
       <ul class="book-list" style="margin-top:18px">
         ${pageResults.map(renderResultItem).join("")}
       </ul>
       ${renderPager(query, page, totalPages)}`;

  return layout(`Busca: ${query}`, form + resultsBlock);
}

function renderPager(query: string, page: number, totalPages: number): string {
  if (totalPages <= 1) return "";
  const mk = (p: number) => {
    const params = new URLSearchParams();
    params.set("q", query);
    if (p > 1) params.set("page", String(p));
    return `/search?${params.toString()}`;
  };
  const prev = page > 1
    ? `<a class="pager-btn prev" href="${mk(page - 1)}">← anterior</a>`
    : `<span class="pager-btn prev disabled" aria-hidden="true">← anterior</span>`;
  const next = page < totalPages
    ? `<a class="pager-btn next" href="${mk(page + 1)}">próximo →</a>`
    : `<span class="pager-btn next disabled" aria-hidden="true">próximo →</span>`;
  return `
<nav class="pager" aria-label="Paginação">
  ${prev}
  <span class="pager-label">
    <strong>${page}</strong><span class="pager-of">de</span><strong>${totalPages}</strong>
  </span>
  ${next}
</nav>`;
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
