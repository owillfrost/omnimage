import { rgbToLab } from './colorConversion'

/**
 * Palette Extractor & Split Toning Analyzer
 * Extracts dominant color and up to 5-color palette with proportional weights from RGBA pixel data.
 * Computes split toning (shadows and highlights chromatic averages in CIELAB space) with
 * clipping rejection, luminance-ramp weighting, skin-tone attenuation, and chroma-weighted averaging.
 */

// Luminance band constants for split-toning separation (easily tunable)
export const SPLIT_TONING_SHADOWS_L_MIN = 5
export const SPLIT_TONING_SHADOWS_L_MAX = 45
export const SPLIT_TONING_LIGHTS_L_MIN = 55
export const SPLIT_TONING_LIGHTS_L_MAX = 95

// Chroma weighting constants (reduces influence of near-neutral grayscale pixels)
export const SPLIT_TONING_CHROMA_CAP = 32
export const SPLIT_TONING_CHROMA_EXPONENT = 1.2
export const SPLIT_TONING_CHROMA_EPSILON = 0.05

// Skin tone protection constants (reduces false highlight grades from warm faces under neutral lighting)
export const SPLIT_TONING_SKIN_ATTENUATION = 0.12

/**
 * Detects if a color in CIELAB space falls within the human skin tone cluster (I-line).
 * Diverse human skin across all ethnicities in CIELAB (D65) clusters tightly in:
 * L* in [35, 82], a* in [5, 34], b* in [8, 40], Chroma in [10, 46], Hue Angle in [25°, 68°].
 */
export function isSkinToneLab(L: number, aLab: number, bLab: number): boolean {
  if (L < 35 || L > 82) return false
  if (aLab < 5 || aLab > 34) return false
  if (bLab < 8 || bLab > 40) return false
  const chroma = Math.sqrt(aLab * aLab + bLab * bLab)
  if (chroma < 10 || chroma > 46) return false
  const hueDeg = (Math.atan2(bLab, aLab) * 180) / Math.PI
  return hueDeg >= 25 && hueDeg <= 68
}

export interface ToneGroupStats {
  L: number           // Weighted average luminance
  a: number           // Weighted average a* [-128..127]
  b: number           // Weighted average b* [-128..127]
  validPixels: number // Valid pixel count in group
  weightSum: number   // Sum of chroma weights applied
}

export interface SplitToningProfile {
  shadows: ToneGroupStats
  highlights: ToneGroupStats
  totalValidPixels: number
  hasShadows: boolean
  hasHighlights: boolean
}

export interface ExtractedPalette {
  dominantColor: string
  palette: string[]
  paletteWeights: number[]
  splitToning?: SplitToningProfile
}

/**
 * Extracts split-toning profile (shadows and highlights color grading) from raw RGBA buffer.
 * - Converts sampled pixels to CIELAB (D65).
 * - Discards clipped pixels (L < 5 and L > 95) such as letterbox black bars or blown highlights.
 * - Discards mid-tones (45 < L < 55) to isolate pure shadows and highlights.
 * - Applies non-linear chroma weighting so near-neutral pixels do not dilute color grade.
 * - Applies luminance ramp weighting so transition midtones don't outweigh deep tones.
 * - Attenuates skin-tone highlights to avoid false warm-grade classification on neutral portraits.
 * - Computes direct vector averages for (a, b) avoiding circular hue averaging artifacts.
 */
export function extractSplitToningFromRgba(
  rgbaData: Uint8Array | Uint8ClampedArray | ArrayLike<number>,
  width: number,
  height: number
): SplitToningProfile {
  let shadowsCount = 0
  let shadowsWeightSum = 0
  let shadowsSumL = 0
  let shadowsSumA = 0
  let shadowsSumB = 0

  let lightsCount = 0
  let lightsWeightSum = 0
  let lightsSumL = 0
  let lightsSumA = 0
  let lightsSumB = 0

  const totalPixels = width * height
  const step = Math.max(1, Math.floor(totalPixels / 4000))

  for (let i = 0; i < rgbaData.length; i += step * 4) {
    const alpha = rgbaData[i + 3]
    if (alpha < 128) continue

    const r = rgbaData[i]
    const g = rgbaData[i + 1]
    const b = rgbaData[i + 2]

    const [L, aLab, bLab] = rgbToLab(r, g, b)

    let isShadow = false
    let isLight = false

    if (L >= SPLIT_TONING_SHADOWS_L_MIN && L <= SPLIT_TONING_SHADOWS_L_MAX) {
      isShadow = true
    } else if (L >= SPLIT_TONING_LIGHTS_L_MIN && L <= SPLIT_TONING_LIGHTS_L_MAX) {
      isLight = true
    } else {
      // Discard clipped extremes (<5 or >95) or midtones (45..55)
      continue
    }

    const chroma = Math.sqrt(aLab * aLab + bLab * bLab)
    const chromaRatio = Math.min(1, chroma / SPLIT_TONING_CHROMA_CAP)
    let weight = Math.pow(chromaRatio, SPLIT_TONING_CHROMA_EXPONENT) + SPLIT_TONING_CHROMA_EPSILON

    // Luminance distance ramp: softly downweights boundary midtones (near L=45 and L=55)
    // while giving full authority (1.0) to deep shadows (L <= 28) and clear highlights (L >= 72)
    const lumRamp = isShadow
      ? Math.min(1, Math.max(0.25, (48 - L) / 20))
      : Math.min(1, Math.max(0.25, (L - 52) / 20))
    weight *= lumRamp

    // Skin tone protection: if pixel falls into human skin tone cluster in highlights,
    // attenuate its weight so portraits under neutral light don't falsely read as warm grades
    if (isLight && isSkinToneLab(L, aLab, bLab)) {
      weight *= SPLIT_TONING_SKIN_ATTENUATION
    }

    if (isShadow) {
      shadowsCount++
      shadowsWeightSum += weight
      shadowsSumL += L * weight
      shadowsSumA += aLab * weight
      shadowsSumB += bLab * weight
    } else if (isLight) {
      lightsCount++
      lightsWeightSum += weight
      lightsSumL += L * weight
      lightsSumA += aLab * weight
      lightsSumB += bLab * weight
    }
  }

  const shadows: ToneGroupStats = {
    L: shadowsWeightSum > 0 ? Number((shadowsSumL / shadowsWeightSum).toFixed(2)) : 25,
    a: shadowsWeightSum > 0 ? Number((shadowsSumA / shadowsWeightSum).toFixed(2)) : 0,
    b: shadowsWeightSum > 0 ? Number((shadowsSumB / shadowsWeightSum).toFixed(2)) : 0,
    validPixels: shadowsCount,
    weightSum: Number(shadowsWeightSum.toFixed(2)),
  }

  const highlights: ToneGroupStats = {
    L: lightsWeightSum > 0 ? Number((lightsSumL / lightsWeightSum).toFixed(2)) : 75,
    a: lightsWeightSum > 0 ? Number((lightsSumA / lightsWeightSum).toFixed(2)) : 0,
    b: lightsWeightSum > 0 ? Number((lightsSumB / lightsWeightSum).toFixed(2)) : 0,
    validPixels: lightsCount,
    weightSum: Number(lightsWeightSum.toFixed(2)),
  }

  return {
    shadows,
    highlights,
    totalValidPixels: shadowsCount + lightsCount,
    hasShadows: shadowsCount > 5,
    hasHighlights: lightsCount > 5,
  }
}

/**
 * Fallback split-toning derivation for legacy items where only hex palette and weights exist.
 */
export function deriveFallbackSplitToningFromPalette(
  palette: string[],
  paletteWeights?: number[]
): SplitToningProfile {
  let shadowsCount = 0
  let shadowsWeightSum = 0
  let shadowsSumL = 0
  let shadowsSumA = 0
  let shadowsSumB = 0

  let lightsCount = 0
  let lightsWeightSum = 0
  let lightsSumL = 0
  let lightsSumA = 0
  let lightsSumB = 0

  for (let i = 0; i < palette.length; i++) {
    const hex = palette[i]
    const pWeight = paletteWeights && paletteWeights[i] !== undefined ? paletteWeights[i] : 1 / palette.length
    const clean = hex.replace('#', '').trim()
    const num = parseInt(clean || '18181b', 16)
    const r = (num >> 16) & 255
    const g = (num >> 8) & 255
    const b = num & 255

    const [L, aLab, bLab] = rgbToLab(r, g, b)
    if (L < SPLIT_TONING_SHADOWS_L_MIN || L > SPLIT_TONING_LIGHTS_L_MAX) continue
    if (L > SPLIT_TONING_SHADOWS_L_MAX && L < SPLIT_TONING_LIGHTS_L_MIN) continue

    const isShadow = L <= SPLIT_TONING_SHADOWS_L_MAX
    const chroma = Math.sqrt(aLab * aLab + bLab * bLab)
    const chromaRatio = Math.min(1, chroma / SPLIT_TONING_CHROMA_CAP)

    const lumRamp = isShadow
      ? Math.min(1, Math.max(0.25, (48 - L) / 20))
      : Math.min(1, Math.max(0.25, (L - 52) / 20))

    let weight =
      (Math.pow(chromaRatio, SPLIT_TONING_CHROMA_EXPONENT) + SPLIT_TONING_CHROMA_EPSILON) *
      pWeight *
      lumRamp

    if (!isShadow && isSkinToneLab(L, aLab, bLab)) {
      weight *= SPLIT_TONING_SKIN_ATTENUATION
    }

    if (isShadow) {
      shadowsCount += Math.max(1, Math.round(pWeight * 100))
      shadowsWeightSum += weight
      shadowsSumL += L * weight
      shadowsSumA += aLab * weight
      shadowsSumB += bLab * weight
    } else {
      lightsCount += Math.max(1, Math.round(pWeight * 100))
      lightsWeightSum += weight
      lightsSumL += L * weight
      lightsSumA += aLab * weight
      lightsSumB += bLab * weight
    }
  }

  return {
    shadows: {
      L: shadowsWeightSum > 0 ? Number((shadowsSumL / shadowsWeightSum).toFixed(2)) : 25,
      a: shadowsWeightSum > 0 ? Number((shadowsSumA / shadowsWeightSum).toFixed(2)) : 0,
      b: shadowsWeightSum > 0 ? Number((shadowsSumB / shadowsWeightSum).toFixed(2)) : 0,
      validPixels: shadowsCount,
      weightSum: Number(shadowsWeightSum.toFixed(2)),
    },
    highlights: {
      L: lightsWeightSum > 0 ? Number((lightsSumL / lightsWeightSum).toFixed(2)) : 75,
      a: lightsWeightSum > 0 ? Number((lightsSumA / lightsWeightSum).toFixed(2)) : 0,
      b: lightsWeightSum > 0 ? Number((lightsSumB / lightsWeightSum).toFixed(2)) : 0,
      validPixels: lightsCount,
      weightSum: Number(lightsWeightSum.toFixed(2)),
    },
    totalValidPixels: shadowsCount + lightsCount,
    hasShadows: shadowsCount > 0,
    hasHighlights: lightsCount > 0,
  }
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

  const splitToning = extractSplitToningFromRgba(rgbaData, width, height)

  return {
    dominantColor: palette[0],
    palette,
    paletteWeights: normWeights,
    splitToning,
  }
}
