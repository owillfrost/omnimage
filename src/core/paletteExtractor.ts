/**
 * Palette Extractor
 * Extracts dominant color and up to 5-color palette with proportional weights from RGBA pixel data.
 * Pure mathematical implementation for perceptual palette extraction.
 */

export interface ExtractedPalette {
  dominantColor: string
  palette: string[]
  paletteWeights: number[]
}

export function extractPaletteFromRgba(
  rgbaData: Uint8Array | Uint8ClampedArray | ArrayLike<number>,
  width: number,
  height: number,
  maxColors = 5
): ExtractedPalette {
  const pixelCount = width * height
  const step = Math.max(1, Math.floor(pixelCount / 2000))
  const buckets = new Map<number, { r: number; g: number; b: number; count: number }>()
  let sampled = 0

  for (let i = 0; i < rgbaData.length; i += step * 4) {
    const a = rgbaData[i + 3]
    if (a < 128) continue
    const r5 = rgbaData[i] >> 3
    const g5 = rgbaData[i + 1] >> 3
    const b5 = rgbaData[i + 2] >> 3
    const key = (r5 << 10) | (g5 << 5) | b5

    let b = buckets.get(key)
    if (!b) {
      b = { r: 0, g: 0, b: 0, count: 0 }
      buckets.set(key, b)
    }
    b.r += rgbaData[i]
    b.g += rgbaData[i + 1]
    b.b += rgbaData[i + 2]
    b.count++
    sampled++
  }

  const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count)
  const top = sorted.slice(0, maxColors)
  if (top.length === 0) {
    return { dominantColor: '#18181b', palette: ['#18181b'], paletteWeights: [1] }
  }

  const palette: string[] = []
  const paletteWeights: number[] = []
  for (const item of top) {
    const r = Math.round(item.r / item.count)
    const g = Math.round(item.g / item.count)
    const b = Math.round(item.b / item.count)
    const hex = '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()
    palette.push(hex)
    paletteWeights.push(Number((item.count / sampled).toFixed(3)))
  }

  const sumWeights = paletteWeights.reduce((a, b) => a + b, 0) || 1
  const normWeights = paletteWeights.map(w => Number((w / sumWeights).toFixed(3)))

  return {
    dominantColor: palette[0],
    palette,
    paletteWeights: normWeights,
  }
}
