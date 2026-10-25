import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { generateImageThumbnailAndPalette } from '../../server/media/thumbnailGenerator'

describe('ThumbnailGenerator 640px WebP & Palette Tests', () => {
  const testDir = path.resolve(process.cwd(), '.tmp-thumb-tests')
  const testImgPath = path.join(testDir, 'sample-1200x800.png')
  const outWebpPath = path.join(testDir, 'thumb.webp')

  beforeAll(async () => {
    sharp.cache(false)
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true })
    }

    // Create a 1200x800 PNG with distinct blue & orange colors
    const svg = `
      <svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
        <rect width="600" height="800" fill="#0066FF"/>
        <rect x="600" width="600" height="800" fill="#FF6600"/>
      </svg>
    `
    await sharp(Buffer.from(svg)).png().toFile(testImgPath)
  })

  afterAll(() => {
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true })
      }
    } catch {
      // ignore Windows file handle delay
    }
  })

  it('generates 640px WebP thumbnail with correct proportions and palette', async () => {
    const result = await generateImageThumbnailAndPalette(testImgPath, outWebpPath)

    expect(fs.existsSync(outWebpPath)).toBe(true)
    expect(result.width).toBe(1200)
    expect(result.height).toBe(800)
    expect(result.aspectRatio).toBe(1.5)

    // Verify thumbnail on disk is WebP and max dimension <= 640
    const thumbMeta = await sharp(outWebpPath).metadata()
    expect(thumbMeta.format).toBe('webp')
    expect(thumbMeta.width).toBe(640)
    expect(thumbMeta.height).toBe(Math.round(640 / 1.5))

    // Verify palette was extracted
    expect(result.dominantColor).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(result.palette.length).toBeGreaterThanOrEqual(1)
    expect(result.paletteWeights.length).toBe(result.palette.length)

    const sumWeights = result.paletteWeights.reduce((a, b) => a + b, 0)
    expect(sumWeights).toBeGreaterThanOrEqual(0.95)
    expect(sumWeights).toBeLessThanOrEqual(1.05)
  })
})
