import sharp from "sharp";

export const COVER_MAX_WIDTH = 400;

export async function processCover(
  imageBuffer: Buffer,
  destPath: string,
): Promise<void> {
  await sharp(imageBuffer)
    .resize({ width: COVER_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(destPath);
}
