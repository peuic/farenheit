import { zipSync, strToU8 } from "fflate";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import sharp from "sharp";

const FIXTURES = __dirname;
const SOURCE = join(FIXTURES, "source");
const OUT = FIXTURES;

function walkFiles(dir: string, base: string = dir): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(base, full).replace(/\\/g, "/");
    if (statSync(full).isDirectory()) {
      Object.assign(out, walkFiles(full, base));
    } else {
      out[rel] = readFileSync(full);
    }
  }
  return out;
}

async function buildValid(): Promise<void> {
  const src = join(SOURCE, "valid");
  const files = walkFiles(src);

  const cover = await sharp({
    create: { width: 600, height: 900, channels: 3, background: { r: 200, g: 50, b: 50 } },
  }).png().toBuffer();
  files["OEBPS/cover.png"] = cover;

  const zipData = zipSync(files, { level: 6, consume: true });
  writeFileSync(join(OUT, "valid.epub"), zipData);
}

async function buildNoCover(): Promise<void> {
  const src = join(SOURCE, "valid");
  const files = walkFiles(src);
  const opf = new TextDecoder().decode(files["OEBPS/content.opf"]!);
  const modifiedOpf = opf
    .replace(/<meta name="cover"[^/]*\/>/g, "")
    .replace(/<item id="cover-image"[^/]*\/>/g, "");
  files["OEBPS/content.opf"] = strToU8(modifiedOpf);
  delete files["OEBPS/cover.png"];
  const zipData = zipSync(files, { level: 6, consume: true });
  writeFileSync(join(OUT, "no-cover.epub"), zipData);
}

async function buildNoTitle(): Promise<void> {
  const src = join(SOURCE, "valid");
  const files = walkFiles(src);
  const opf = new TextDecoder().decode(files["OEBPS/content.opf"]!);
  const modifiedOpf = opf
    .replace(/<dc:title>[^<]*<\/dc:title>/, "")
    .replace(/<dc:creator>[^<]*<\/dc:creator>/, "");
  files["OEBPS/content.opf"] = strToU8(modifiedOpf);
  const zipData = zipSync(files, { level: 6, consume: true });
  writeFileSync(join(OUT, "no-title.epub"), zipData);
}

async function buildCorrupted(): Promise<void> {
  writeFileSync(join(OUT, "corrupted.epub"), Buffer.from("not a zip, just garbage bytes\n"));
}

async function main() {
  if (!existsSync(SOURCE)) {
    throw new Error(`source fixtures missing at ${SOURCE}`);
  }
  await buildValid();
  await buildNoCover();
  await buildNoTitle();
  await buildCorrupted();
  console.log("fixtures built");
}

main();
