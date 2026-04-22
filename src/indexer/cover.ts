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
  await sharp(imageBuffer)
    .resize({ width: COVER_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(destPath);
}
