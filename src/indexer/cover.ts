import sharp from "sharp";

export const COVER_MAX_WIDTH = 400;
export const COVER_EXT = "jpg";
export const COVER_MIME = "image/jpeg";

export async function processCover(
  imageBuffer: Buffer,
  destPath: string,
): Promise<void> {
  // Kobo's experimental browser runs a very old WebKit that doesn't
  // support WebP, so we serve JPEG. mozjpeg trims ~15% off the size.
  // progressive: false — mozjpeg defaults to progressive scan, which the
  // Kindle experimental browser fails to decode (renders as broken-image
  // placeholder). Baseline JPEG works on every device we care about.
  await sharp(imageBuffer)
    .resize({ width: COVER_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true, progressive: false })
    .toFile(destPath);
}
