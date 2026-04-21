import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";

export type ParsedCover = {
  data: Buffer;
  mimeType: string;
  extension: string;
};

export type ParsedEpub = {
  title: string | null;
  author: string | null;
  description: string | null;
  cover: ParsedCover | null;
};

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  isArray: (name) => ["item", "meta", "creator"].includes(name),
});

function findString(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === "string") return val.trim() || null;
  if (Array.isArray(val)) return findString(val[0]);
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if (typeof obj["#text"] === "string") return (obj["#text"] as string).trim() || null;
    for (const v of Object.values(obj)) {
      const s = findString(v);
      if (s) return s;
    }
  }
  return null;
}

export async function parseEpub(path: string): Promise<ParsedEpub> {
  const buf = readFileSync(path);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buf);
  } catch (e) {
    throw new Error(`not a valid epub (zip): ${path}: ${(e as Error).message}`);
  }

  const containerRaw = files["META-INF/container.xml"];
  if (!containerRaw) {
    throw new Error(`epub missing META-INF/container.xml: ${path}`);
  }
  const container = xml.parse(strFromU8(containerRaw));
  const opfPath: string | undefined =
    container?.container?.rootfiles?.rootfile?.["@_full-path"] ??
    container?.container?.rootfiles?.rootfile?.[0]?.["@_full-path"];
  if (!opfPath) {
    throw new Error(`epub OPF path not found: ${path}`);
  }

  const opfRaw = files[opfPath];
  if (!opfRaw) {
    throw new Error(`epub OPF file missing at ${opfPath}: ${path}`);
  }
  const opf = xml.parse(strFromU8(opfRaw));

  const meta = opf?.package?.metadata ?? {};
  const title = findString(meta.title);
  const author = findString(meta.creator);
  const description = findString(meta.description);

  const manifest = opf?.package?.manifest?.item ?? [];
  const manifestArr: any[] = Array.isArray(manifest) ? manifest : [manifest];

  const metaArr: any[] = Array.isArray(meta.meta) ? meta.meta : meta.meta ? [meta.meta] : [];
  const coverMeta = metaArr.find((m) => m?.["@_name"] === "cover");
  const coverIdFromMeta: string | undefined = coverMeta?.["@_content"];

  const coverItem =
    manifestArr.find((it) => it?.["@_id"] === coverIdFromMeta) ??
    manifestArr.find((it) => (it?.["@_properties"] ?? "").includes("cover-image"));

  let cover: ParsedCover | null = null;
  if (coverItem?.["@_href"]) {
    const href: string = coverItem["@_href"];
    const opfDir = opfPath.includes("/") ? opfPath.replace(/\/[^/]+$/, "") : "";
    const coverPath = opfDir ? `${opfDir}/${href}` : href;
    const data = files[coverPath] ?? files[normalize(coverPath)];
    if (data) {
      const mimeType: string = coverItem["@_media-type"] ?? guessMime(href);
      cover = {
        data: Buffer.from(data),
        mimeType,
        extension: extFromMime(mimeType, href),
      };
    }
  }

  return { title, author, description, cover };
}

function normalize(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function guessMime(href: string): string {
  const lower = href.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

function extFromMime(mime: string, href: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  const m = href.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1]! : "bin";
}
