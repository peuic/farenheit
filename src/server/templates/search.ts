import { escapeHtml, layout } from "./layout";
import type { BookWithDownload } from "../../store/types";

export function renderSearchPage(
  query: string,
  pageResults: BookWithDownload[],
  totalResults: number,
  page: number,
  totalPages: number,
): string {
  const topbar = `
<table class="topbar-main"><tr>
  <td class="col-left"><a class="back" href="/"><span class="back-arrow">←</span>voltar</a></td>
  <td class="col-center"><span class="heading">Buscar</span></td>
  <td class="col-right"></td>
</tr></table>`;

  const form = `
<div class="page-narrow">
  <div class="overline">Buscar</div>
  <h1>título ou autor</h1>
  <form class="search-form" method="get" action="/search">
    <input type="text" name="q" value="${escapeHtml(query)}" placeholder="digite aqui…" autofocus>
    <br>
    <button type="submit">Buscar</button>
  </form>
`;

  if (!query) {
    return layout("Buscar — Farenheit", topbar + form + `</div>`);
  }

  const resultsBlock = totalResults === 0
    ? `<div class="empty">Nenhum livro com “${escapeHtml(query)}”.</div>`
    : `<div class="count" style="margin-bottom:8px">
         <strong>${totalResults}</strong> ${totalResults === 1 ? "resultado" : "resultados"}
       </div>
       <ul class="book-list">
         ${pageResults.map(renderResultItem).join("")}
       </ul>
       ${renderPager(query, page, totalPages)}`;

  return layout(`Busca: ${query}`, topbar + form + resultsBlock + `</div>`);
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
    ? `<a class="pager-btn" href="${mk(page - 1)}">← anterior</a>`
    : `<span class="pager-btn disabled">← anterior</span>`;
  const next = page < totalPages
    ? `<a class="pager-btn" href="${mk(page + 1)}">próximo →</a>`
    : `<span class="pager-btn disabled">próximo →</span>`;
  return `
<table class="pager" style="margin-top:14px"><tr>
  <td class="col-left">${prev}</td>
  <td class="col-center"><strong>${page}</strong>&nbsp;de&nbsp;<strong>${totalPages}</strong></td>
  <td class="col-right">${next}</td>
</tr></table>`;
}

function renderResultItem(b: BookWithDownload): string {
  const coverHtml = b.coverFilename
    ? `<img class="cover" src="/book/${b.id}/cover?v=${b.mtime}" alt="" width="50" height="75">`
    : `<div class="cover placeholder">sem<br>capa</div>`;
  const authorHtml = b.author
    ? `<div class="author">${escapeHtml(b.author)}</div>`
    : "";
  const classes = [
    b.downloadedAt ? "downloaded" : "",
    !b.onDisk ? "unsynced" : "",
  ].filter(Boolean).join(" ");
  return `
<li class="${classes}">
  <a href="/book/${b.id}">
    <span class="marker"></span>
    ${coverHtml}
    <div class="meta">
      <div class="title">${escapeHtml(b.title)}</div>
      ${authorHtml}
    </div>
  </a>
</li>`;
}
