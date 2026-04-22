import { escapeHtml, layout } from "./layout";
import type { BookWithDownload, CategoryCount } from "../../store/types";

export type SortKey = "recent" | "title" | "author";

export const PAGE_SIZE = 10;

type Opts = {
  pageTitle: string;
  overline: string;
  heading: string;
  tallyHtml?: string;                              // raw HTML
  sort: SortKey;
  sortBasePath: string;                            // "/" or "/c/Ficcao"
  backHref?: string;
  categories?: CategoryCount[];
  books: BookWithDownload[];                       // already paginated
  page: number;
  totalPages: number;
  letterIndex?: Record<string, number> | null;     // letter → page (null = no alphanav)
};

const SEARCH_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>`;

export function renderHome(o: Opts): string {
  const categoriesHtml = (o.categories ?? []).length
    ? `<nav class="categories" aria-label="Categorias">
         ${o.categories!.map(c =>
           `<a href="/c/${encodeURIComponent(c.name)}">${escapeHtml(c.name)} · ${c.count}</a>`
         ).join("")}
       </nav>`
    : "";

  const sortBarHtml = renderSortBar(o.sort, o.sortBasePath);

  const alphanavHtml = o.letterIndex
    ? renderAlphanav(o.letterIndex, o.sortBasePath, o.sort)
    : "";

  const booksHtml = o.books.length === 0
    ? `<div class="empty">Nenhum livro por aqui.</div>`
    : `<ul class="book-list">${o.books.map(renderBookItem).join("")}</ul>`;

  const pagerHtml = renderPager(o.page, o.totalPages, o.sortBasePath, o.sort);

  const backLink = o.backHref
    ? `<a class="back" href="${escapeHtml(o.backHref)}">todos</a>`
    : `<span></span>`;

  const body = `
<header class="masthead">
  <div class="brand">Farenheit</div>
  ${backLink}
  <a class="icon-btn" href="/search" aria-label="Buscar">${SEARCH_ICON}</a>
</header>

<section class="title-block">
  <div class="overline">${escapeHtml(o.overline)}</div>
  <h1>${escapeHtml(o.heading)}</h1>
  ${o.tallyHtml ? `<div class="tally">${o.tallyHtml}</div>` : ""}
</section>

<form class="search-inline" method="get" action="/search" role="search">
  <input type="text" name="q" placeholder="buscar por título ou autor…" autocomplete="off">
</form>

${categoriesHtml}
${sortBarHtml}
${alphanavHtml}
${booksHtml}
${pagerHtml}
`;
  return layout(o.pageTitle, body);
}

function renderSortBar(sort: SortKey, basePath: string): string {
  const link = (key: SortKey, label: string) => {
    // Switching sort always drops the page back to 1.
    const href = pageUrl(basePath, key, 1);
    const cls = sort === key ? "active" : "";
    return `<a class="${cls}" href="${href}">${label}</a>`;
  };
  return `
<div class="sortbar">
  <span class="label">Ordenar por</span>
  <span class="options">
    ${link("recent", "recente")}
    ${link("title", "título")}
    ${link("author", "autor")}
  </span>
</div>`;
}

function renderAlphanav(
  letterIndex: Record<string, number>,
  basePath: string,
  sort: SortKey,
): string {
  const cells: string[] = [];
  for (const L of ALPHABET) {
    const page = letterIndex[L];
    cells.push(page !== undefined
      ? `<a href="${pageUrl(basePath, sort, page)}">${L}</a>`
      : `<span aria-hidden="true">${L}</span>`);
  }
  const hashPage = letterIndex["#"];
  cells.push(hashPage !== undefined
    ? `<a href="${pageUrl(basePath, sort, hashPage)}">#</a>`
    : `<span aria-hidden="true">#</span>`);
  return `<nav class="alphanav" aria-label="Pular para letra">${cells.join("")}</nav>`;
}

function renderPager(
  page: number,
  totalPages: number,
  basePath: string,
  sort: SortKey,
): string {
  if (totalPages <= 1) return "";
  const prevHref = page > 1 ? pageUrl(basePath, sort, page - 1) : null;
  const nextHref = page < totalPages ? pageUrl(basePath, sort, page + 1) : null;

  const prev = prevHref
    ? `<a class="pager-btn prev" href="${prevHref}">← anterior</a>`
    : `<span class="pager-btn prev disabled" aria-hidden="true">← anterior</span>`;
  const next = nextHref
    ? `<a class="pager-btn next" href="${nextHref}">próximo →</a>`
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

function renderBookItem(b: BookWithDownload): string {
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

// ——— helpers (exported so routes can build letter→page index) ———

export function pageUrl(basePath: string, sort: SortKey, page: number): string {
  const params: string[] = [];
  if (sort !== "recent") params.push(`sort=${sort}`);
  if (page > 1) params.push(`page=${page}`);
  return params.length ? `${basePath}?${params.join("&")}` : basePath;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function firstLetter(s: string): string {
  const trimmed = s.replace(/^[\s"'“”«»¿¡(—–-]+/, "");
  const firstChar = trimmed.charAt(0);
  if (!firstChar) return "#";
  const folded = firstChar.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const up = folded.toUpperCase();
  return /^[A-Z]$/.test(up) ? up : "#";
}

export function buildLetterIndex(
  sortedBooks: BookWithDownload[],
  pageSize: number,
  keyFn: (b: BookWithDownload) => string,
): Record<string, number> {
  const map: Record<string, number> = {};
  for (let i = 0; i < sortedBooks.length; i++) {
    const L = firstLetter(keyFn(sortedBooks[i]!));
    if (map[L] === undefined) {
      map[L] = Math.floor(i / pageSize) + 1;
    }
  }
  return map;
}
