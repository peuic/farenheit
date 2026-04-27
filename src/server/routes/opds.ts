import type { Ctx } from "./context";
import type { BookWithDownload } from "../../store/types";

// OPDS clients (KOReader, Aldiko, the Xteink built-in reader, …) typically
// handle larger feed batches than the web UI. 30 per page is the common
// sweet spot — small enough to render quickly, big enough to avoid lots of
// page turns when browsing.
export const OPDS_PAGE_SIZE = 30;

const NAV_TYPE = "application/atom+xml;profile=opds-catalog;kind=navigation";
const ACQ_TYPE = "application/atom+xml;profile=opds-catalog;kind=acquisition";

// ─────────────────────────────────────────────────────────────────────────
// /opds  →  navigation feed (mirrors Calibre-Web's tier structure that
// strict OPDS clients like the Xteink built-in reader expect)
// ─────────────────────────────────────────────────────────────────────────
export function handleOpdsRoot(ctx: Ctx, url: URL): Response {
  const base = `${url.protocol}//${url.host}`;
  const total = ctx.store.list({}).filter((b) => b.onDisk).length;
  const now = new Date().toISOString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:farenheit:catalog</id>
  <title>Farenheit</title>
  <updated>${now}</updated>
  <author><name>Farenheit</name></author>
  <link rel="self" href="${base}/opds" type="${NAV_TYPE}"/>
  <link rel="start" href="${base}/opds" type="${NAV_TYPE}"/>
  <entry>
    <id>urn:farenheit:catalog:books</id>
    <title>All books</title>
    <updated>${now}</updated>
    <content type="text">${total} ${total === 1 ? "book" : "books"} ready to read.</content>
    <link rel="subsection" href="${base}/opds/books" type="${ACQ_TYPE}"/>
  </entry>
</feed>`;

  return xmlResponse(xml, NAV_TYPE);
}

// ─────────────────────────────────────────────────────────────────────────
// /opds/books?page=N  →  acquisition feed
// ─────────────────────────────────────────────────────────────────────────
export function handleOpdsBooks(ctx: Ctx, url: URL): Response {
  const rawPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;

  // Skip placeholders — OPDS clients can't act on a "retry sync" UI affordance.
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

  return xmlResponse(xml, ACQ_TYPE);
}

function xmlResponse(xml: string, profile: string): Response {
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": `${profile};charset=utf-8`,
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
    ? `<link rel="next" href="${base}/opds/books?page=${page + 1}" type="${ACQ_TYPE}"/>`
    : "";
  const prevLink = page > 1
    ? `<link rel="previous" href="${page > 2 ? `${base}/opds/books?page=${page - 1}` : firstHref}" type="${ACQ_TYPE}"/>`
    : "";

  const entries = books.map((b) => renderEntry(b, base, mobiAvailable)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:farenheit:catalog:books${page > 1 ? `:page:${page}` : ""}</id>
  <title>Farenheit — All books</title>
  <subtitle>${total} ${total === 1 ? "book" : "books"}</subtitle>
  <updated>${now}</updated>
  <author><name>Farenheit</name></author>
  <link rel="self" href="${selfHref}" type="${ACQ_TYPE}"/>
  <link rel="start" href="${startHref}" type="${NAV_TYPE}"/>
  <link rel="up" href="${upHref}" type="${NAV_TYPE}"/>
  <link rel="first" href="${firstHref}" type="${ACQ_TYPE}"/>
  <link rel="last" href="${lastHref}" type="${ACQ_TYPE}"/>
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

  // OPDS-conventional element order: id, title, updated, author, summary,
  // content, links. Several Java-based parsers (Onyx/Xteink, KOReader, …)
  // are picky about this even though Atom doesn't strictly require it.
  const lines: string[] = [];
  lines.push(`  <entry>`);
  lines.push(`    <id>${id}</id>`);
  lines.push(`    <title>${escapeXml(b.title)}</title>`);
  lines.push(`    <updated>${updated}</updated>`);

  if (b.author) {
    lines.push(`    <author><name>${escapeXml(b.author)}</name></author>`);
  }

  // Always provide a summary — some clients reject entries without one.
  const desc = b.description ? stripHtmlPlain(b.description) : "";
  const summaryText = desc || (b.author ? `${b.title} — ${b.author}` : b.title);
  lines.push(`    <summary type="text">${escapeXml(summaryText)}</summary>`);

  // Acquisition links first — strict clients render the feed primarily
  // for these, image links are decorative.
  lines.push(`    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="${escapeXml(`${base}/book/${b.id}/download`)}" title="EPUB"/>`);
  if (mobiAvailable) {
    lines.push(`    <link rel="http://opds-spec.org/acquisition" type="application/x-mobipocket-ebook" href="${escapeXml(`${base}/book/${b.id}/download.mobi`)}" title="MOBI"/>`);
  }

  if (b.coverFilename) {
    const coverUrl = `${base}/book/${b.id}/cover?v=${b.mtime}`;
    lines.push(`    <link rel="http://opds-spec.org/image" type="image/jpeg" href="${escapeXml(coverUrl)}"/>`);
    lines.push(`    <link rel="http://opds-spec.org/image/thumbnail" type="image/jpeg" href="${escapeXml(coverUrl)}"/>`);
  }

  lines.push(`  </entry>`);
  return lines.join("\n");
}

// XML 1.0 forbids most control chars. Strip them — a single stray form-feed
// or vertical-tab inside an epub description (common for PDF-extracted text)
// is enough to make a strict parser reject the whole feed.
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

function stripHtmlPlain(raw: string): string {
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
