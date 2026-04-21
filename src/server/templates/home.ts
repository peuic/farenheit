import { escapeHtml, layout } from "./layout";
import type { BookWithDownload, CategoryCount } from "../../store/types";

type Opts = {
  pageTitle: string;
  heading: string;
  subHeading?: string;
  backHref?: string;
  categories?: CategoryCount[];
  books: BookWithDownload[];
};

export function renderHome(o: Opts): string {
  const categoriesHtml = (o.categories ?? []).length
    ? `<h2>Categorias</h2>
       <div class="categories">
         ${o.categories!.map(c =>
           `<a href="/c/${encodeURIComponent(c.name)}">${escapeHtml(c.name)} (${c.count})</a>`
         ).join("")}
       </div>`
    : "";

  const bookItems = o.books.length
    ? `<ul class="book-list">
         ${o.books.map(b => renderBookItem(b)).join("")}
       </ul>`
    : `<p class="empty">Nenhum livro por aqui.</p>`;

  const body = `
<div class="nav">
  ${o.backHref ? `<a href="${escapeHtml(o.backHref)}">← Voltar</a>` : `<span></span>`}
  <a class="icon-btn" href="/search" aria-label="Buscar">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
  </a>
</div>
<h1>${escapeHtml(o.heading)}</h1>
${o.subHeading ? `<p class="sub">${escapeHtml(o.subHeading)}</p>` : ""}
${categoriesHtml}
<h2>Livros${o.backHref ? "" : " na raiz"}</h2>
${bookItems}
`;
  return layout(o.pageTitle, body);
}

function renderBookItem(b: BookWithDownload): string {
  const coverHtml = b.coverFilename
    ? `<img class="cover" src="/book/${b.id}/cover?v=${b.mtime}" alt="">`
    : `<div class="cover placeholder">sem capa</div>`;
  const authorHtml = b.author ? `<div class="author">${escapeHtml(b.author)}</div>` : "";
  const cls = b.downloadedAt ? "downloaded" : "";
  return `
<li class="${cls}">
  <a href="/book/${b.id}">
    ${coverHtml}
    <div class="meta">
      <div class="title">${escapeHtml(b.title)}</div>
      ${authorHtml}
    </div>
  </a>
</li>`;
}
