import { escapeHtml, layout } from "./layout";
import type { BookWithDownload } from "../../store/types";

export function renderBook(b: BookWithDownload, backHref: string): string {
  const coverHtml = b.coverFilename
    ? `<img class="cover-big" src="/book/${b.id}/cover?v=${b.mtime}" alt="">`
    : `<div class="cover-big placeholder">sem capa</div>`;

  const filemetaParts = [
    "epub",
    formatSize(b.sizeBytes),
    b.downloadedAt ? `baixado ${formatRelTime(b.downloadedAt)}` : `adicionado ${formatRelTime(b.addedAt)}`,
  ];

  const descriptionText = b.description ? stripHtmlToPlainText(b.description) : "";
  const descriptionHtml = descriptionText
    ? `<div class="description">${escapeHtml(descriptionText)}</div>`
    : "";

  const btnClass = b.downloadedAt ? "download-btn done" : "download-btn";
  const btnText = b.downloadedAt ? "⬇  Baixar novamente" : "⬇  Baixar no Kobo";

  const unsyncedWarn = !b.onDisk
    ? `<div class="warn">⏳ Este livro ainda não baixou do iCloud. Você pode forçar uma nova tentativa.</div>`
    : "";
  const downloadHtml = b.onDisk
    ? `<a class="${btnClass}" href="/book/${b.id}/download">${btnText}</a>`
    : `<a class="download-btn retry" href="/book/${b.id}/sync-retry">↻  Tentar sincronizar</a>`;

  const body = `
<div class="nav">
  <a href="${escapeHtml(backHref)}">← Voltar</a>
  <a href="/">Farenheit</a>
</div>
<div class="detail">
  ${coverHtml}
  <h1>${escapeHtml(b.title)}</h1>
  ${b.author ? `<div class="author">${escapeHtml(b.author)}</div>` : ""}
  <div class="filemeta">${filemetaParts.join(" · ")}</div>
  ${unsyncedWarn}
  ${descriptionHtml}
  ${downloadHtml}
</div>
`;
  return layout(b.title, body);
}

// Some epubs store <dc:description> as HTML (e.g. "<p>foo</p><br>bar").
// fast-xml-parser decodes entities, so we end up with literal HTML in the DB.
// Strip tags + decode a few common entities the XML parser left alone,
// collapse whitespace. Rendered output is then safely re-escaped by caller.
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
