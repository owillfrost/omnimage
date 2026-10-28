import type { Artwork } from '../types/artwork'
import { rgbToLab } from './colorConversion'
import {
  type SplitToningProfile,
  deriveFallbackSplitToningFromPalette,
} from './paletteExtractor'

export { rgbToLab } from './colorConversion'

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim()
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16)
    const g = parseInt(clean[1] + clean[1], 16)
    const b = parseInt(clean[2] + clean[2], 16)
    return [r, g, b]
  }
  const num = parseInt(clean || '18181b', 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  return [h * 360, s, l]
}

// Fast in-memory vector cache for CIELAB and HSL color values
const LAB_CACHE = new Map<string, [number, number, number]>()
const HSL_CACHE = new Map<string, [number, number, number]>()

export function getCachedLab(hex: string): [number, number, number] {
  const clean = hex.toLowerCase().trim()
  const cached = LAB_CACHE.get(clean)
  if (cached) return cached
  const [r, g, b] = hexToRgb(clean)
  const lab = rgbToLab(r, g, b)
  LAB_CACHE.set(clean, lab)
  return lab
}

export function getCachedHsl(hex: string): [number, number, number] {
  const clean = hex.toLowerCase().trim()
  const cached = HSL_CACHE.get(clean)
  if (cached) return cached
  const [r, g, b] = hexToRgb(clean)
  const hsl = rgbToHsl(r, g, b)
  HSL_CACHE.set(clean, hsl)
  return hsl
}

/**
 * Calculates perceptual color distance between two colors.
 * Combines CIELAB Delta-E (luminance & chrominance) with HSL circular Hue distance.
 * Fully memoized: runs in microseconds without re-parsing hex strings.
 */
export function calculateColorDistance(hex1: string, hex2: string): number {
  if (hex1 === hex2) return 0

  // CIELAB distance
  const [L1, a1, bVal1] = getCachedLab(hex1)
  const [L2, a2, bVal2] = getCachedLab(hex2)

  const deltaL = L1 - L2
  const deltaA = a1 - a2
  const deltaB = bVal1 - bVal2
  const deltaE = Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB)

  // HSL Hue distance
  const [h1, s1] = getCachedHsl(hex1)
  const [h2, s2] = getCachedHsl(hex2)

  const dHue = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2)) / 180
  // Weight hue higher when both colors are saturated
  const saturationWeight = Math.min(s1, s2)
  const huePenalty = dHue * saturationWeight * 35

  return deltaE + huePenalty
}

export interface ScoredArtwork {
  artwork: Artwork
  distance: number
  similarityPercent: number
}

/**
 * Computes bidirectional weighted palette distance (Earth Mover's / Chamfer approximation)
 * between an anchor artwork's full 5-color palette and a candidate artwork's full 5-color palette,
 * weighted by Eagle's proportional coverage ratios.
 */
export function calculateWeightedPaletteDistance(
  anchorColors: string[],
  anchorWeights: number[] | undefined,
  candColors: string[],
  candWeights: number[] | undefined
): number {
  const aLen = anchorColors.length
  const cLen = candColors.length
  if (aLen === 0 || cLen === 0) return 90

  // 1. Forward pass: For each color in Anchor, find closest match in Candidate (weighted by Anchor ratio)
  let forwardDist = 0
  let forwardWeightSum = 0
  for (let i = 0; i < aLen; i++) {
    const aHex = anchorColors[i]
    const wA = anchorWeights && anchorWeights[i] !== undefined ? anchorWeights[i] : 1 / aLen
    let bestMatch = 999
    for (let j = 0; j < cLen; j++) {
      const d = calculateColorDistance(aHex, candColors[j])
      // Slight penalty if matching a dominant anchor color against a tiny accent color
      const wC = candWeights && candWeights[j] !== undefined ? candWeights[j] : 1 / cLen
      const ratioPenalty = wA > 0.3 && wC < 0.08 ? 1.15 : 1.0
      const penalized = d * ratioPenalty
      if (penalized < bestMatch) {
        bestMatch = penalized
      }
    }
    forwardDist += bestMatch * wA
    forwardWeightSum += wA
  }
  if (forwardWeightSum > 0) forwardDist /= forwardWeightSum

  // 2. Backward pass: For each color in Candidate, find closest match in Anchor (weighted by Candidate ratio)
  // Prevents a candidate with a huge neon background + small matching detail from ranking as identical
  let backwardDist = 0
  let backwardWeightSum = 0
  for (let j = 0; j < cLen; j++) {
    const cHex = candColors[j]
    const wC = candWeights && candWeights[j] !== undefined ? candWeights[j] : 1 / cLen
    let bestMatch = 999
    for (let i = 0; i < aLen; i++) {
      const d = calculateColorDistance(cHex, anchorColors[i])
      if (d < bestMatch) {
        bestMatch = d
      }
    }
    backwardDist += bestMatch * wC
    backwardWeightSum += wC
  }
  if (backwardWeightSum > 0) backwardDist /= backwardWeightSum

  // 3. Dominant-to-dominant anchor cohesion (keeps mood/lighting consistent)
  const domDist = calculateColorDistance(anchorColors[0], candColors[0])

  // Blend: 50% forward harmony + 30% backward harmony + 20% primary mood
  return forwardDist * 0.5 + backwardDist * 0.3 + domDist * 0.2
}

export interface GradeTuningOptions {
  balance?: number // -100 (100% shadows) to +100 (100% highlights), default 0
  shadowOverride?: { a: number; b: number }
  highlightOverride?: { a: number; b: number }
}

/**
 * Compares two images by their split-toning color grade (shadows and highlights color casts in CIELAB).
 * - Computes deltaE (Euclidean distance on a/b plane) between shadows and between highlights.
 * - Weights each group according to its valid pixel count and optional user balance (-100 shadows .. +100 highlights).
 * - Incorporates a gentle penalty if there is an extreme shadow/highlight balance disparity.
 */
export function calculateSplitToningDistance(
  profileA?: SplitToningProfile,
  profileB?: SplitToningProfile,
  tuning?: GradeTuningOptions
): number {
  if (!profileA || !profileB) return 50

  const sA = profileA.shadows
  const sB = profileB.shadows
  const hA = profileA.highlights
  const hB = profileB.highlights

  const shadowA_a = tuning?.shadowOverride ? tuning.shadowOverride.a : sA.a
  const shadowA_b = tuning?.shadowOverride ? tuning.shadowOverride.b : sA.b
  const lightA_a = tuning?.highlightOverride ? tuning.highlightOverride.a : hA.a
  const lightA_b = tuning?.highlightOverride ? tuning.highlightOverride.b : hA.b

  // Delta E in a/b chrominance plane
  const deltaAs = shadowA_a - sB.a
  const deltaBs = shadowA_b - sB.b
  const distShadows = Math.sqrt(deltaAs * deltaAs + deltaBs * deltaBs)

  const deltaAh = lightA_a - hB.a
  const deltaBh = lightA_b - hB.b
  const distHighlights = Math.sqrt(deltaAh * deltaAh + deltaBh * deltaBh)

  // Confidence weighting based on valid pixels:
  // A group with fewer valid pixels (e.g. sparse highlights in a low-key image) receives less weight.
  const REF_PIXELS = 60
  const confSA = Math.min(1, sA.validPixels / REF_PIXELS)
  const confSB = Math.min(1, sB.validPixels / REF_PIXELS)

  const confHA = Math.min(1, hA.validPixels / REF_PIXELS)
  const confHB = Math.min(1, hB.validPixels / REF_PIXELS)

  // Balance between shadows and highlights (-100: shadows only, 0: 50/50, +100: highlights only)
  const balance = tuning?.balance !== undefined ? Math.max(-100, Math.min(100, tuning.balance)) : 0
  const factorShadows = (100 - balance) / 100
  const factorHighlights = (100 + balance) / 100

  const weightShadows = confSA * confSB * factorShadows
  const weightHighlights = confHA * confHB * factorHighlights

  const totalWeight = weightShadows + weightHighlights
  if (totalWeight <= 0.001) {
    // Both images have virtually no valid pixels in either group
    return 75
  }

  const weightedDist = (distShadows * weightShadows + distHighlights * weightHighlights) / totalWeight

  // Gentle balance disparity penalty (e.g. pure high-key compared against pure low-key)
  const totalA = (sA.validPixels + hA.validPixels) || 1
  const totalB = (sB.validPixels + hB.validPixels) || 1
  const ratioSA = sA.validPixels / totalA
  const ratioSB = sB.validPixels / totalB
  const ratioDiff = Math.abs(ratioSA - ratioSB)
  const imbalancePenalty = ratioDiff * 8 * Math.max(0, 1 - Math.abs(balance) / 100)

  return weightedDist + imbalancePenalty
}

/**
 * Sorts all artworks by weighted full-palette harmony or split-toning grade relative to the target artwork.
 */
export function sortArtworksByColorProximity(
  artworks: Artwork[],
  targetArtwork: Artwork,
  mode: 'color' | 'grade' = 'color',
  tuning?: GradeTuningOptions
): ScoredArtwork[] {
  const targetColor = targetArtwork.dominantColor || '#ffffff'
  const anchorColors =
    targetArtwork.palette && targetArtwork.palette.length > 0
      ? targetArtwork.palette
      : [targetColor]
  const anchorWeights = targetArtwork.paletteWeights
  const anchorGrade =
    targetArtwork.splitToning ||
    deriveFallbackSplitToningFromPalette(anchorColors, anchorWeights)

  const scored: ScoredArtwork[] = artworks.map((art) => {
    // If it's the exact target artwork, distance is 0 and similarity is 100%
    if (art.id === targetArtwork.id) {
      return { artwork: art, distance: 0, similarityPercent: 100 }
    }

    const candColors =
      art.palette && art.palette.length > 0
        ? art.palette
        : [art.dominantColor || '#18181b']

    let minDistance: number
    if (mode === 'grade') {
      const candGrade =
        art.splitToning ||
        deriveFallbackSplitToningFromPalette(candColors, art.paletteWeights)
      minDistance = calculateSplitToningDistance(anchorGrade, candGrade, tuning)
    } else {
      minDistance = calculateWeightedPaletteDistance(
        anchorColors,
        anchorWeights,
        candColors,
        art.paletteWeights
      )
    }

    // Normalized similarity percentage: deltaE around 85 is max typical palette/grade difference
    const similarityPercent = Math.max(0, Math.min(100, Math.round((1 - minDistance / 85) * 100)))

    return {
      artwork: art,
      distance: minDistance,
      similarityPercent,
    }
  })

  // Sort ascending: smallest distance (closest palette harmony or grade) comes first
  scored.sort((a, b) => a.distance - b.distance)

  // If target artwork is an ephemeral external anchor not in the library, ensure it is anchored at index 0
  const containsTarget = artworks.some((a) => a.id === targetArtwork.id)
  if (!containsTarget) {
    scored.unshift({ artwork: targetArtwork, distance: 0, similarityPercent: 100 })
  }

  return scored
}

/**
 * Spatial cell index with precalculated radial distance from (0, 0).
 */
export interface RadialCellRank {
  col: number
  row: number
  dist: number
}

// Precomputed radial cell lookup table for rapid O(1) ranking up to radius 80 (25,921 cells)
export const RADIAL_LOOKUP: RadialCellRank[] = []
const RADIUS = 80

for (let col = -RADIUS; col <= RADIUS; col++) {
  for (let row = -RADIUS; row <= RADIUS; row++) {
    // Aspect correction: grid columns are typically 260px wide, rows ~320px high
    const dist = Math.sqrt(col * 1.15 * (col * 1.15) + row * row)
    RADIAL_LOOKUP.push({ col, row, dist })
  }
}

// Sort from center (0, 0) outward in concentric rings, tie-breaking by angle
RADIAL_LOOKUP.sort((a, b) => {
  if (Math.abs(a.dist - b.dist) > 0.0001) {
    return a.dist - b.dist
  }
  return Math.atan2(a.row, a.col) - Math.atan2(b.row, b.col)
})

// Flat Int32Array lookup table for (col, row) -> rank index (eliminates string allocation & Map overhead)
const GRID_DIM = 2 * RADIUS + 1
const CELL_TO_RANK = new Int32Array(GRID_DIM * GRID_DIM).fill(-1)
RADIAL_LOOKUP.forEach((cell, idx) => {
  const index = (cell.col + RADIUS) * GRID_DIM + (cell.row + RADIUS)
  CELL_TO_RANK[index] = idx
})

/**
 * Returns the radial rank index for cell (col, row) where (0, 0) is rank 0.
 * Neighbors in ring 1 are ranks 1-8, ring 2 are ranks 9-24, etc.
 */
export function getRadialRank(col: number, row: number): number {
  if (col >= -RADIUS && col <= RADIUS && row >= -RADIUS && row <= RADIUS) {
    const index = (col + RADIUS) * GRID_DIM + (row + RADIUS)
    const rank = CELL_TO_RANK[index]
    if (rank !== -1) return rank
  }

  // Gauss circle formula fallback for extreme infinite panning: pi * R^2
  const dist = Math.sqrt(col * 1.15 * (col * 1.15) + row * row)
  return Math.round(Math.PI * dist * dist)
}

export type ColorFilterMode = 'OR' | 'AND'

/**
 * Builds a contiguous Float32Array containing [L, a, b, h, s] tuples (5 floats per color)
 * for an artwork's dominantColor (slot 0) followed by its unique palette swatches.
 * Eliminates string normalization and Map lookups during live 2D color picker scrubbing.
 */
export function buildArtworkColorVectors(
  dominantColor: string,
  palette?: string[]
): Float32Array {
  const dom = (dominantColor || '#18181b').toLowerCase().trim()
  const uniqueSwatches: string[] = [dom]

  if (palette && palette.length > 0) {
    for (let i = 0; i < palette.length; i++) {
      const c = palette[i].toLowerCase().trim()
      if (c && !uniqueSwatches.includes(c)) {
        uniqueSwatches.push(c)
      }
    }
  }

  const vec = new Float32Array(uniqueSwatches.length * 5)
  for (let i = 0; i < uniqueSwatches.length; i++) {
    const hex = uniqueSwatches[i]
    const [L, a, b] = getCachedLab(hex)
    const [h, s] = getCachedHsl(hex)
    const offset = i * 5
    vec[offset] = L
    vec[offset + 1] = a
    vec[offset + 2] = b
    vec[offset + 3] = h
    vec[offset + 4] = s
  }

  return vec
}

/**
 * Fast vector-to-vector perceptual color distance using pre-extracted [L, a, b, h, s].
 */
function calculateVectorDistance(
  L1: number,
  a1: number,
  b1: number,
  h1: number,
  s1: number,
  vec: Float32Array,
  offset: number
): number {
  const deltaL = L1 - vec[offset]
  const deltaA = a1 - vec[offset + 1]
  const deltaB = b1 - vec[offset + 2]
  const deltaE = Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB)

  const h2 = vec[offset + 3]
  const s2 = vec[offset + 4]
  const absHue = Math.abs(h1 - h2)
  const dHue = (absHue < 360 - absHue ? absHue : 360 - absHue) / 180
  const saturationWeight = s1 < s2 ? s1 : s2
  const huePenalty = dHue * saturationWeight * 35

  return deltaE + huePenalty
}

/**
 * Checks whether an artwork matches the selected color palette filter in OR (any) or AND (all) mode.
 * Uses pre-computed Float32Array colorVectors when available (< 0.5ms for 22,000 artworks).
 */
export function matchesColorFilter(
  artwork: Artwork,
  selectedColors: string[],
  mode: ColorFilterMode = 'OR'
): boolean {
  const numSelected = selectedColors.length
  if (numSelected === 0) return true

  // Ensure colorVectors is populated lazily if not pre-built at ingestion
  let vec = artwork.colorVectors
  if (!vec) {
    vec = buildArtworkColorVectors(artwork.dominantColor || '#18181b', artwork.palette)
    artwork.colorVectors = vec
  }

  const matchesSingleColor = (targetHex: string): boolean => {
    const [L1, a1, b1] = getCachedLab(targetHex)
    const [h1, s1] = getCachedHsl(targetHex)

    // Slot 0: dominantColor (threshold <= 32)
    if (calculateVectorDistance(L1, a1, b1, h1, s1, vec, 0) <= 32) {
      return true
    }

    // Slots 1..N: palette swatches (threshold <= 28)
    for (let offset = 5; offset < vec.length; offset += 5) {
      if (calculateVectorDistance(L1, a1, b1, h1, s1, vec, offset) <= 28) {
        return true
      }
    }

    return false
  }

  if (mode === 'AND') {
    for (let i = 0; i < numSelected; i++) {
      if (!matchesSingleColor(selectedColors[i])) return false
    }
    return true
  }

  for (let i = 0; i < numSelected; i++) {
    if (matchesSingleColor(selectedColors[i])) return true
  }
  return false
}
