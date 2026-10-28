import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import {
  extractPaletteFromRgba,
  type ExtractedPalette,
  type SplitToningProfile,
} from '../../src/core/paletteExtractor'

export interface GeneratedThumbnailResult {
  width: number
  height: number
  aspectRatio: number
  dominantColor: string
  palette: string[]
  paletteWeights: number[]
  splitToning?: SplitToningProfile
  thumbPath: string
}

/**
 * High-performance 640px WebP thumbnail generator and palette extractor.
 * - Auto-rotates using EXIF orientation tags.
 * - Resizes inside 640x640 box without enlargement.
 * - Emits crisp WebP (quality 82, effort 3) for 150-200% HiDPI display.
 * - Samples 128x128 raw RGBA in memory for instant (< 3ms) color clustering.
 */
export async function generateImageThumbnailAndPalette(
  inputPathOrBuffer: string | Buffer,
  destWebpPath: string
): Promise<GeneratedThumbnailResult> {
  const destDir = path.dirname(destWebpPath)
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }

  const pipeline = sharp(inputPathOrBuffer).rotate()
  const metadata = await pipeline.metadata()

  const origWidth = metadata.width || 640
  const origHeight = metadata.height || 640
  const aspectRatio = Number((origWidth / origHeight).toFixed(3))

  // 1. Generate 640px WebP thumbnail file
  const tmpDestPath = `${destWebpPath}.tmp.${Date.now()}`
  await sharp(inputPathOrBuffer)
    .rotate()
    .resize({
      width: 640,
      height: 640,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality: 82,
      effort: 3,
    })
    .toFile(tmpDestPath)

  fs.renameSync(tmpDestPath, destWebpPath)

  // 2. Extract palette from raw RGBA buffer (128x128 sample)
  let paletteData: ExtractedPalette = {
    dominantColor: '#18181b',
    palette: ['#18181b'],
    paletteWeights: [1],
  }

  try {
    const { data, info } = await sharp(inputPathOrBuffer)
      .rotate()
      .resize({
        width: 128,
        height: 128,
        fit: 'cover',
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    paletteData = extractPaletteFromRgba(data, info.width, info.height, 5)
  } catch {
    // fallback default palette
  }

  return {
    width: origWidth,
    height: origHeight,
    aspectRatio,
    dominantColor: paletteData.dominantColor,
    palette: paletteData.palette,
    paletteWeights: paletteData.paletteWeights,
    splitToning: paletteData.splitToning,
    thumbPath: destWebpPath,
  }
}
