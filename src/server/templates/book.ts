import { escapeHtml, layout } from "./layout";
import type { BookWithDownload } from "../../store/types";

export function renderBook(b: BookWithDownload, backHref: string): string {
  const coverHtml = b.coverFilename
    ? `<img class="cover-big" src="/book/${b.id}/cover?v=${b.mtime}" alt="" loading="lazy">`
    : `<div class="cover-big placeholder">sem capa</div>`;

  const specs = [
    "epub",
    formatSize(b.sizeBytes),
    b.downloadedAt
      ? `baixado ${formatRelTime(b.downloadedAt)}`
      : `adicionado ${formatRelTime(b.addedAt)}`,
  ].join(`<span class="sep">·</span>`);

  const descriptionText = b.description ? stripHtmlToPlainText(b.description) : "";
  const descriptionHtml = descriptionText
    ? `<div class="description">${escapeHtml(descriptionText)}</div>`
    : "";

  const unsyncedWarn = !b.onDisk
    ? `<div class="warn">Este livro ainda não baixou do iCloud. Você pode forçar uma nova tentativa.</div>`
    : "";

  let downloadHtml: string;
  if (!b.onDisk) {
    downloadHtml = `<a class="download-btn retry" href="/book/${b.id}/sync-retry">Tentar sincronizar</a>`;
  } else if (b.downloadedAt) {
    downloadHtml = `<a class="download-btn done" href="/book/${b.id}/download">Baixar novamente</a>`;
  } else {
    downloadHtml = `<a class="download-btn" href="/book/${b.id}/download">Baixar no Kobo</a>`;
  }

  const body = `
<header class="topbar">
  <div class="line primary">
    <a class="back" href="${escapeHtml(backHref)}">voltar</a>
    <span class="heading">Livro</span>
    <span class="icons"><a class="icon-btn" href="/" aria-label="Home">§</a></span>
  </div>
</header>
<div class="page-narrow">
  <article class="detail">
    ${coverHtml}
    <h1>${escapeHtml(b.title)}</h1>
    ${b.author ? `<div class="byline">${escapeHtml(b.author)}</div>` : ""}
    <div class="specs">${specs}</div>
    ${unsyncedWarn}
    ${descriptionHtml}
    ${downloadHtml}
  </article>
</div>
`;
  return layout(b.title, body);
}

function stripHtmlToPlainText(raw: string): string {
  return raw
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<\s*\/\s*p\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelTime(tsMs: number): string {
  const diff = Date.now() - tsMs;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "hoje";
  if (diff < 2 * day) return "ontem";
  const days = Math.floor(diff / day);
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(days / 365);
  return `há ${years} ${years === 1 ? "ano" : "anos"}`;
}
