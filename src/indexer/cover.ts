import sharp from "sharp";

export const COVER_MAX_WIDTH = 400;
export const COVER_EXT = "jpg";
export const COVER_MIME = "image/jpeg";

export async function processCover(
  imageBuffer: Buffer,
  destPath: string,
): Promise<void> {
  // Kobo's experimental browser runs a very old WebKit that doesn't
  // support WebP, so we serve JPEG. We deliberately do NOT enable
  // sharp's mozjpeg path — it forces progressive scan regardless of the
  // explicit `progressive: false` option, and progressive JPEGs render
  // as broken images on the Kindle experimental browser. Baseline JPEG
  // is ~15% larger but works on every device we care about.
  await sharp(imageBuffer)
    .resize({ width: COVER_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: false })
    .toFile(destPath);
}
