import type { Ctx } from "./context";
import type { BookWithDownload } from "../../store/types";

// OPDS clients (KOReader, Aldiko, the Xteink/Onyx built-in reader, …) handle
// larger feed batches than the web UI. 30 per page is the common sweet spot.
export const OPDS_PAGE_SIZE = 30;

// Calibre-web — the de-facto reference implementation for strict OPDS readers
// — serves bare `application/atom+xml`. The `profile=opds-catalog;kind=…`
// flavour is only used for `<link type="…">` attributes, NOT the HTTP header.
const HTTP_TYPE = "application/atom+xml;charset=utf-8";
const NAV_LINK_TYPE = "application/atom+xml;profile=opds-catalog";
const ACQ_LINK_TYPE = "application/atom+xml;profile=opds-catalog;kind=acquisition";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

// ─── /opds/test  →  minimal hardcoded feed for diagnosing parser quirks ──
// If this loads on the Xteink but /opds/books doesn't, the issue is in the
// real entries (special chars, length, etc.). If even this fails, the
// problem is structural and we need to iterate on the feed shape itself.
export function handleOpdsTest(_ctx: Ctx, url: URL): Response {
  const base = `${url.protocol}//${url.host}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Farenheit Test</title>
  <id>urn:farenheit:test</id>
  <updated>2026-01-01T00:00:00Z</updated>
  <author><name>Farenheit</name></author>
  <link rel="self" href="${base}/opds/test" type="${ACQ_LINK_TYPE}"/>
  <link rel="start" href="${base}/opds" type="${NAV_LINK_TYPE}"/>
  <entry>
    <title>Test Book</title>
    <id>urn:farenheit:test:1</id>
    <updated>2026-01-01T00:00:00Z</updated>
    <author><name>Test Author</name></author>
    <content type="text">A minimal test entry with only ASCII characters.</content>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="${base}/book/1/download"/>
  </entry>
</feed>`;
  return xmlResponse(xml);
}

// ─── /opds  →  navigation feed ──────────────────────────────────────────
export function handleOpdsRoot(ctx: Ctx, url: URL): Response {
  const base = `${url.protocol}//${url.host}`;
  const total = ctx.store.list({}).filter((b) => b.onDisk).length;
  const now = new Date().toISOString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Farenheit</title>
  <id>urn:farenheit:catalog</id>
  <updated>${now}</updated>
  <author><name>Farenheit</name></author>
  <link rel="self" href="${base}/opds" type="${NAV_LINK_TYPE}"/>
  <link rel="start" href="${base}/opds" type="${NAV_LINK_TYPE}"/>
  <entry>
    <title>All books</title>
    <id>urn:farenheit:catalog:books</id>
    <updated>${now}</updated>
    <content type="text">${total} ${total === 1 ? "book" : "books"} ready to read.</content>
    <link rel="subsection" href="${base}/opds/books" type="${NAV_LINK_TYPE}"/>
  </entry>
</feed>`;

  return xmlResponse(xml);
}

// ─── /opds/books?page=N  →  acquisition feed ───────────────────────────
export function handleOpdsBooks(ctx: Ctx, url: URL): Response {
  const rawPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;

  const all = ctx.store.list({}).filter((b) => b.onDisk);
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / OPDS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * OPDS_PAGE_SIZE;
  const books = all.slice(offset, offset + OPDS_PAGE_SIZE);

  const base = `${url.protocol}//${url.host}`;
  const xml = renderAcquisitionFeed(books, {
    base,
    page: currentPage,
    totalPages,
    total,
    mobiAvailable: ctx.config.ebookConvertPath !== null,
  });

  return xmlResponse(xml);
}

function xmlResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": HTTP_TYPE,
      "Cache-Control": "no-store",
    },
  });
}

type RenderOpts = {
  base: string;
  page: number;
  totalPages: number;
  total: number;
  mobiAvailable: boolean;
};

function renderAcquisitionFeed(books: BookWithDownload[], opts: RenderOpts): string {
  const { base, page, totalPages, total, mobiAvailable } = opts;
  const now = new Date().toISOString();

  const selfHref = page > 1 ? `${base}/opds/books?page=${page}` : `${base}/opds/books`;
  const startHref = `${base}/opds`;
  const upHref = `${base}/opds`;
  const firstHref = `${base}/opds/books`;
  const lastHref = totalPages > 1 ? `${base}/opds/books?page=${totalPages}` : firstHref;
  const nextLink = page < totalPages
    ? `<link rel="next" href="${base}/opds/books?page=${page + 1}" type="${ACQ_LINK_TYPE}"/>`
    : "";
  const prevLink = page > 1
    ? `<link rel="previous" href="${page > 2 ? `${base}/opds/books?page=${page - 1}` : firstHref}" type="${ACQ_LINK_TYPE}"/>`
    : "";

  const entries = books.map((b) => renderEntry(b, base, mobiAvailable)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Farenheit — All books</title>
  <id>urn:farenheit:catalog:books${page > 1 ? `:page:${page}` : ""}</id>
  <updated>${now}</updated>
  <author><name>Farenheit</name></author>
  <link rel="self" href="${selfHref}" type="${ACQ_LINK_TYPE}"/>
  <link rel="start" href="${startHref}" type="${NAV_LINK_TYPE}"/>
  <link rel="up" href="${upHref}" type="${NAV_LINK_TYPE}"/>
  <link rel="first" href="${firstHref}" type="${ACQ_LINK_TYPE}"/>
  <link rel="last" href="${lastHref}" type="${ACQ_LINK_TYPE}"/>
  ${nextLink}
  ${prevLink}
${entries}
</feed>`;
}

function renderEntry(
  b: BookWithDownload,
  base: string,
  mobiAvailable: boolean,
): string {
  const id = `urn:farenheit:book:${b.id}`;
  const updated = new Date(b.indexedAt || b.addedAt).toISOString();

  // Minimal entry — every Atom-mandatory element only: title, id, updated,
  // author, plus the cover and acquisition links. No <content>/<summary>:
  // dropping descriptions removes whole categories of parser-confounding
  // input (curly quotes, soft hyphens, leftover HTML entities, long text).
  const lines: string[] = [];
  lines.push(`  <entry>`);
  lines.push(`    <title>${escapeXml(b.title)}</title>`);
  lines.push(`    <id>${id}</id>`);
  lines.push(`    <updated>${updated}</updated>`);

  if (b.author) {
    lines.push(`    <author><name>${escapeXml(b.author)}</name></author>`);
  }

  if (b.coverFilename) {
    const coverUrl = `${base}/book/${b.id}/cover?v=${b.mtime}`;
    lines.push(`    <link rel="http://opds-spec.org/image" type="image/jpeg" href="${escapeXml(coverUrl)}"/>`);
    lines.push(`    <link rel="http://opds-spec.org/image/thumbnail" type="image/jpeg" href="${escapeXml(coverUrl)}"/>`);
  }

  lines.push(`    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="${escapeXml(`${base}/book/${b.id}/download`)}" title="EPUB"/>`);
  if (mobiAvailable) {
    lines.push(`    <link rel="http://opds-spec.org/acquisition" type="application/x-mobipocket-ebook" href="${escapeXml(`${base}/book/${b.id}/download.mobi`)}" title="MOBI"/>`);
  }

  lines.push(`  </entry>`);
  return lines.join("\n");
}

// XML 1.0 forbids most control chars. Strip them — a single stray form-feed
// or vertical-tab in an epub description (common for PDF-extracted text)
// is enough to make a strict parser reject the whole document.
const ILLEGAL_XML_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g;

function escapeXml(s: string): string {
  return s
    .replace(ILLEGAL_XML_CHARS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

