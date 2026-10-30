/**
 * Spatial Layout & Wireframe Fingerprint Extractor
 * 
 * Extracts a compact 288-byte spatial layout fingerprint from visual assets:
 * - 16x9 canonical spatial grid (144 cells)
 * - Channel 0: Foreground Mass / Contrast relative to adaptive background luminance (invariant to Dark/Light mode)
 * - Channel 1: High-Frequency Edge Energy (|dx| + |dy|) identifying text lines, icons, buttons and UI blocks
 * - Soft 3x3 spatial pooling blur providing tolerance to ~5% element displacement
 * - Quantized to Uint8 (0..255) per cell channel
 */

export const LAYOUT_GRID_W = 16
export const LAYOUT_GRID_H = 9
export const LAYOUT_CHANNELS = 2
export const LAYOUT_VECTOR_DIM = LAYOUT_GRID_W * LAYOUT_GRID_H * LAYOUT_CHANNELS // 288 bytes

export interface LayoutTuningOptions {
  /** Balance given to aspect ratio cohesion [0..0.5], default 0.15 */
  aspectWeight?: number
  /** Sensitivity exponent [0.5..2.5], default 1.0 */
  sensitivity?: number
}

export interface LayoutExtractionResult {
  vector: Uint8Array
  dim: number
  bgLuminance: number
}

/**
 * Applies a 3x3 Gaussian-like spatial blur kernel over a gw x gh grid.
 * Softens boundaries and grants tolerance to minor translation/scale shifts.
 */
function applySpatialBlur(src: Float32Array, gw: number, gh: number): Float32Array {
  const dst = new Float32Array(gw * gh)
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let sum = 0
      let wSum = 0
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= gh) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= gw) continue
          const weight = dx === 0 && dy === 0 ? 0.5 : dx === 0 || dy === 0 ? 0.1 : 0.025
          sum += src[ny * gw + nx] * weight
          wSum += weight
        }
      }
      dst[y * gw + x] = sum / wSum
    }
  }
  return dst
}

/**
 * Extracts layout vector from pure raw grayscale pixels [0..255].
 * Environment-agnostic: runs seamlessly in Node, Web Workers, or Browser Canvas contexts.
 */
export function extractLayoutFromGrayscale(
  gray: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number
): LayoutExtractionResult {
  // 1. Estimate background luminance from borders and corners
  const sampleCorner = (x: number, y: number) => gray[y * w + x]
  const cornerLums = [
    sampleCorner(1, 1),
    sampleCorner(w - 2, 1),
    sampleCorner(1, h - 2),
    sampleCorner(w - 2, h - 2),
    sampleCorner(Math.floor(w / 2), 1),
    sampleCorner(Math.floor(w / 2), h - 2),
  ]
  cornerLums.sort((a, b) => a - b)
  // Median of outer perimeter gives clean background luminance estimate
  const bgL = Math.round((cornerLums[2] + cornerLums[3]) / 2)

  // 2. Cell sizes mapping down to 16x9 grid
  const cellW = w / LAYOUT_GRID_W
  const cellH = h / LAYOUT_GRID_H

  const massGrid = new Float32Array(LAYOUT_GRID_W * LAYOUT_GRID_H)
  const edgeGrid = new Float32Array(LAYOUT_GRID_W * LAYOUT_GRID_H)

  for (let gy = 0; gy < LAYOUT_GRID_H; gy++) {
    const yStart = Math.floor(gy * cellH)
    const yEnd = Math.floor((gy + 1) * cellH)

    for (let gx = 0; gx < LAYOUT_GRID_W; gx++) {
      const xStart = Math.floor(gx * cellW)
      const xEnd = Math.floor((gx + 1) * cellW)

      let cellMassSum = 0
      let cellEdgeSum = 0
      let pixelCount = 0

      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const idx = y * w + x
          const val = gray[idx]

          // Channel 0: Foreground contrast relative to background
          const contrast = Math.abs(val - bgL)
          cellMassSum += contrast

          // Channel 1: High-frequency edge magnitude (horizontal + vertical derivatives)
          const left = x > 0 ? gray[idx - 1] : val
          const right = x < w - 1 ? gray[idx + 1] : val
          const top = y > 0 ? gray[idx - w] : val
          const bottom = y < h - 1 ? gray[idx + w] : val

          const dx = Math.abs(right - left)
          const dy = Math.abs(bottom - top)
          cellEdgeSum += dx + dy

          pixelCount++
        }
      }

      const gridIdx = gy * LAYOUT_GRID_W + gx
      massGrid[gridIdx] = pixelCount > 0 ? cellMassSum / pixelCount : 0
      edgeGrid[gridIdx] = pixelCount > 0 ? cellEdgeSum / pixelCount : 0
    }
  }

  // 3. Soft spatial blur (gives ~5% shift tolerance)
  const blurredMass = applySpatialBlur(massGrid, LAYOUT_GRID_W, LAYOUT_GRID_H)
  const blurredEdge = applySpatialBlur(edgeGrid, LAYOUT_GRID_W, LAYOUT_GRID_H)

  // 4. Quantize to Uint8 [0..255]
  let maxMass = 1e-5
  let maxEdge = 1e-5
  for (let i = 0; i < LAYOUT_GRID_W * LAYOUT_GRID_H; i++) {
    if (blurredMass[i] > maxMass) maxMass = blurredMass[i]
    if (blurredEdge[i] > maxEdge) maxEdge = blurredEdge[i]
  }

  const vector = new Uint8Array(LAYOUT_VECTOR_DIM)
  for (let i = 0; i < LAYOUT_GRID_W * LAYOUT_GRID_H; i++) {
    // Channel 0: Foreground Mass
    vector[i * 2] = Math.min(255, Math.round((blurredMass[i] / maxMass) * 255))
    // Channel 1: Edge Energy
    vector[i * 2 + 1] = Math.min(255, Math.round((blurredEdge[i] / maxEdge) * 255))
  }

  return {
    vector,
    dim: LAYOUT_VECTOR_DIM,
    bgLuminance: bgL,
  }
}

/**
 * Extracts layout vector from raw RGBA pixel data.
 */
export function extractLayoutFromRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number
): LayoutExtractionResult {
  const pixelCount = w * h
  const gray = new Uint8Array(pixelCount)
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4
    const r = rgba[offset]
    const g = rgba[offset + 1]
    const b = rgba[offset + 2]
    // Standard perceptual luminance coefficients (Rec. 601)
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }
  return extractLayoutFromGrayscale(gray, w, h)
}

/**
 * High-performance backend helper: extracts layout vector from an image Buffer via Sharp.
 * Uses 64x36 downsampled grayscale (only 2,304 bytes), running in ~1-3ms.
 */
export async function extractLayoutFromBuffer(
  inputBuffer: Buffer,
  sampleW = 64,
  sampleH = 36
): Promise<LayoutExtractionResult> {
  const sharpModule = await import('sharp')
  const sharp = sharpModule.default || sharpModule

  const { data: gray, info } = await sharp(inputBuffer)
    .resize(sampleW, sampleH, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return extractLayoutFromGrayscale(gray, info.width, info.height)
}

/**
 * Fast Redmean color distance between two RGB colors.
 * Approximates human perceptual color difference without heavy Lab cubic roots.
 */
export function fastRedmeanDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number
): number {
  const rBar = (r1 + r2) * 0.5
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  const wR = 2 + rBar / 256
  const wG = 4.0
  const wB = 2 + (255 - rBar) / 256
  return Math.sqrt(wR * dr * dr + wG * dg * dg + wB * db * db)
}

/**
 * Extracts a robust v2 layout fingerprint from RGBA pixels:
 * 1. Full 1px continuous perimeter sampling with variance detection.
 *    If perimeter variance is high (full-bleed photo), falls back to global median.
 * 2. Channel 0 (Mass): Redmean perceptual color distance to adaptive background.
 * 3. Channel 1 (Edges): Multi-channel RGB Sobel (max of R, G, B gradients) with soft noise thresholding.
 * 4. Contrast floor with explicit flat image stability.
 */
export function extractLayoutV2FromRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number
): LayoutExtractionResult {
  // 1. Continuous 1px perimeter sampling
  let sumR = 0
  let sumG = 0
  let sumB = 0
  let pCount = 0

  const pR: number[] = []
  const pG: number[] = []
  const pB: number[] = []

  const samplePixel = (x: number, y: number) => {
    const idx = (y * w + x) * 4
    const r = rgba[idx]
    const g = rgba[idx + 1]
    const b = rgba[idx + 2]
    pR.push(r)
    pG.push(g)
    pB.push(b)
    sumR += r
    sumG += g
    sumB += b
    pCount++
  }

  // Sample top & bottom rows
  for (let x = 0; x < w; x++) {
    samplePixel(x, 0)
    if (h > 1) samplePixel(x, h - 1)
  }
  // Sample left & right columns
  for (let y = 1; y < h - 1; y++) {
    samplePixel(0, y)
    if (w > 1) samplePixel(w - 1, y)
  }

  const meanR = sumR / Math.max(1, pCount)
  const meanG = sumG / Math.max(1, pCount)
  const meanB = sumB / Math.max(1, pCount)

  // Compute perimeter variance (std dev)
  let varianceSum = 0
  for (let i = 0; i < pCount; i++) {
    const d = fastRedmeanDistance(pR[i], pG[i], pB[i], meanR, meanG, meanB)
    varianceSum += d * d
  }
  const perimeterStdDev = Math.sqrt(varianceSum / Math.max(1, pCount))

  let bgR = meanR
  let bgG = meanG
  let bgB = meanB

  // If perimeter has low variance (<= 48), it is a true framed background (UI, poster, graphic).
  // Use median of perimeter.
  // If perimeter has high variance (> 48), it is a full-bleed photo/scene without a uniform border.
  // Fallback to global median of subsampled image.
  if (perimeterStdDev <= 48 && pCount > 0) {
    pR.sort((a, b) => a - b)
    pG.sort((a, b) => a - b)
    pB.sort((a, b) => a - b)
    const mid = Math.floor(pCount / 2)
    bgR = pR[mid]
    bgG = pG[mid]
    bgB = pB[mid]
  } else {
    // Global median of image (sampled with step 2 for speed)
    const allR: number[] = []
    const allG: number[] = []
    const allB: number[] = []
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const idx = (y * w + x) * 4
        allR.push(rgba[idx])
        allG.push(rgba[idx + 1])
        allB.push(rgba[idx + 2])
      }
    }
    allR.sort((a, b) => a - b)
    allG.sort((a, b) => a - b)
    allB.sort((a, b) => a - b)
    const mid = Math.floor(allR.length / 2)
    bgR = allR[mid] ?? 128
    bgG = allG[mid] ?? 128
    bgB = allB[mid] ?? 128
  }

  // 2. Map cells down to 16x9 canonical spatial grid
  const cellW = w / LAYOUT_GRID_W
  const cellH = h / LAYOUT_GRID_H

  const massGrid = new Float32Array(LAYOUT_GRID_W * LAYOUT_GRID_H)
  const edgeGrid = new Float32Array(LAYOUT_GRID_W * LAYOUT_GRID_H)

  for (let gy = 0; gy < LAYOUT_GRID_H; gy++) {
    const yStart = Math.floor(gy * cellH)
    const yEnd = Math.floor((gy + 1) * cellH)

    for (let gx = 0; gx < LAYOUT_GRID_W; gx++) {
      const xStart = Math.floor(gx * cellW)
      const xEnd = Math.floor((gx + 1) * cellW)

      let cellMassSum = 0
      let cellEdgeSum = 0
      let pixelCount = 0

      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const idx = (y * w + x) * 4
          const r = rgba[idx]
          const g = rgba[idx + 1]
          const b = rgba[idx + 2]

          // Channel 0: Redmean distance to adaptive background
          const massDist = fastRedmeanDistance(r, g, b, bgR, bgG, bgB)
          cellMassSum += massDist

          // Channel 1: Multi-channel RGB Sobel with max magnitude & soft noise threshold
          const leftIdx = (y * w + Math.max(0, x - 1)) * 4
          const rightIdx = (y * w + Math.min(w - 1, x + 1)) * 4
          const topIdx = (Math.max(0, y - 1) * w + x) * 4
          const bottomIdx = (Math.min(h - 1, y + 1) * w + x) * 4

          const dxR = Math.abs(rgba[rightIdx] - rgba[leftIdx])
          const dyR = Math.abs(rgba[bottomIdx] - rgba[topIdx])
          const dxG = Math.abs(rgba[rightIdx + 1] - rgba[leftIdx + 1])
          const dyG = Math.abs(rgba[bottomIdx + 1] - rgba[topIdx + 1])
          const dxB = Math.abs(rgba[rightIdx + 2] - rgba[leftIdx + 2])
          const dyB = Math.abs(rgba[bottomIdx + 2] - rgba[topIdx + 2])

          const dx = Math.max(dxR, dxG, dxB)
          const dy = Math.max(dyR, dyG, dyB)
          const edgeMag = dx + dy

          // Soft noise thresholding: max(0, g - 12)
          const edgeSoft = Math.max(0, edgeMag - 12)
          cellEdgeSum += edgeSoft

          pixelCount++
        }
      }

      const gridIdx = gy * LAYOUT_GRID_W + gx
      massGrid[gridIdx] = pixelCount > 0 ? cellMassSum / pixelCount : 0
      edgeGrid[gridIdx] = pixelCount > 0 ? cellEdgeSum / pixelCount : 0
    }
  }

  // 3. Soft spatial blur (3x3)
  const blurredMass = applySpatialBlur(massGrid, LAYOUT_GRID_W, LAYOUT_GRID_H)
  const blurredEdge = applySpatialBlur(edgeGrid, LAYOUT_GRID_W, LAYOUT_GRID_H)

  // 4. Contrast floor & flat image protection
  let maxMass = 0
  let maxEdge = 0
  for (let i = 0; i < LAYOUT_GRID_W * LAYOUT_GRID_H; i++) {
    if (blurredMass[i] > maxMass) maxMass = blurredMass[i]
    if (blurredEdge[i] > maxEdge) maxEdge = blurredEdge[i]
  }

  const MIN_MASS_FLOOR = 20.0
  const MIN_EDGE_FLOOR = 15.0
  const isFlat = maxMass < MIN_MASS_FLOOR && maxEdge < MIN_EDGE_FLOOR

  const normMass = Math.max(maxMass, MIN_MASS_FLOOR)
  const normEdge = Math.max(maxEdge, MIN_EDGE_FLOOR)

  const vector = new Uint8Array(LAYOUT_VECTOR_DIM)
  for (let i = 0; i < LAYOUT_GRID_W * LAYOUT_GRID_H; i++) {
    vector[i * 2] = isFlat ? 0 : Math.min(255, Math.round((blurredMass[i] / normMass) * 255))
    vector[i * 2 + 1] = isFlat ? 0 : Math.min(255, Math.round((blurredEdge[i] / normEdge) * 255))
  }

  const bgLum = Math.round(0.299 * bgR + 0.587 * bgG + 0.114 * bgB)

  return {
    vector,
    dim: LAYOUT_VECTOR_DIM,
    bgLuminance: bgLum,
  }
}

/**
 * Extracts a robust v2 layout fingerprint directly from an image buffer using Sharp.
 */
export async function extractLayoutV2FromBuffer(
  inputBuffer: Buffer,
  sampleW = 64,
  sampleH = 36
): Promise<LayoutExtractionResult> {
  const sharpModule = await import('sharp')
  const sharp = sharpModule.default || sharpModule

  const { data: rgba, info } = await sharp(inputBuffer)
    .resize(sampleW, sampleH, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return extractLayoutV2FromRgba(rgba, info.width, info.height)
}

/**
 * Horizontally flips a 16x9 layout vector (columns x' = 15 - x).
 * Enables instant mirror-tolerant layout comparison.
 */
export function flipLayoutVectorHorizontal(vector: Uint8Array): Uint8Array {
  const flipped = new Uint8Array(vector.length)
  for (let y = 0; y < LAYOUT_GRID_H; y++) {
    for (let x = 0; x < LAYOUT_GRID_W; x++) {
      const srcIdx = (y * LAYOUT_GRID_W + x) * LAYOUT_CHANNELS
      const dstX = LAYOUT_GRID_W - 1 - x
      const dstIdx = (y * LAYOUT_GRID_W + dstX) * LAYOUT_CHANNELS
      flipped[dstIdx] = vector[srcIdx]
      flipped[dstIdx + 1] = vector[srcIdx + 1]
    }
  }
  return flipped
}

/**
 * Computes cosine similarity with optional mirror tolerance (max of normal and horizontally flipped).
 */
export function computeMirrorTolerantCosine(vecA: Uint8Array, vecB: Uint8Array): number {
  const normalSim = computeLayoutCosineSimilarity(vecA, vecB)
  const flippedB = flipLayoutVectorHorizontal(vecB)
  const mirrorSim = computeLayoutCosineSimilarity(vecA, flippedB)
  return Math.max(normalSim, mirrorSim)
}

/**
 * Computes cosine similarity [0..1] between two standalone Uint8 layout vectors.
 */
export function computeLayoutCosineSimilarity(vecA: Uint8Array, vecB: Uint8Array): number {
  if (vecA.length !== vecB.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i]
    const b = vecB[i]
    dot += a * b
    normA += a * a
    normB += b * b
  }
  if (normA === 0 && normB === 0) return 1.0 // flat images match each other perfectly
  if (normA === 0 || normB === 0) return 0.0 // flat images stay far from structured images
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Computes cosine similarity between two rows in a contiguous layout binary buffer.
 * Optimized for Web Worker radial sorting loops with precomputed inverse norms.
 */
export function computeQuantizedLayoutCosine(
  vecs: Uint8Array,
  dim: number,
  rowA: number,
  rowB: number,
  invNorms?: Float32Array | null
): number {
  if (dim <= 0) return 0
  const offsetA = rowA * dim
  const offsetB = rowB * dim

  let dot = 0
  for (let d = 0; d < dim; d++) {
    dot += vecs[offsetA + d] * vecs[offsetB + d]
  }

  if (invNorms) {
    const normA = invNorms[rowA] ?? 0
    const normB = invNorms[rowB] ?? 0
    if (normA === 0 && normB === 0) return 1.0
    if (normA === 0 || normB === 0) return 0.0
    return dot * normA * normB
  }

  let nA = 0
  let nB = 0
  for (let d = 0; d < dim; d++) {
    const a = vecs[offsetA + d]
    const b = vecs[offsetB + d]
    nA += a * a
    nB += b * b
  }
  if (nA === 0 && nB === 0) return 1.0
  if (nA === 0 || nB === 0) return 0.0
  return dot / (Math.sqrt(nA) * Math.sqrt(nB))
}

/**
 * Calculates layout distance in the Omnimage standard scale [0..85],
 * combining spatial grid similarity (85%) with aspect ratio cohesion (15%).
 * Distance 0 = 100% match; distance >= 85 = 0% match.
 */
export function calculateLayoutDistance(
  vecA: Uint8Array,
  vecB: Uint8Array,
  aspectA = 1.0,
  aspectB = 1.0,
  tuning?: LayoutTuningOptions
): number {
  const cosSim = computeLayoutCosineSimilarity(vecA, vecB)

  // Aspect ratio cohesion (portrait vs landscape vs square)
  const aspectDiff = Math.abs(Math.log((aspectA || 1.0) / (aspectB || 1.0)))
  const aspectSim = Math.max(0, 1 - aspectDiff * 1.1)

  const aspectWeight = tuning?.aspectWeight ?? 0.15
  const layoutWeight = 1 - aspectWeight

  const combinedSim = Math.max(0, Math.min(1, cosSim * layoutWeight + aspectSim * aspectWeight))
  if (combinedSim >= 0.999999) return 0

  // Map similarity [0..1] to standard distance [0..85]
  return (1 - combinedSim) * 85
}

/**
 * Converts distance [0..85] to normalized similarity percentage [0..100],
 * optionally applying tuning sensitivity stretch.
 */
export function calculateLayoutSimilarityPercent(
  distance: number,
  tuning?: LayoutTuningOptions
): number {
  if (distance >= 85) return 0
  const baseSim = Math.max(0, Math.min(1, 1 - distance / 85))

  if (tuning?.sensitivity !== undefined && tuning.sensitivity !== 1.0) {
    const sens = tuning.sensitivity
    const exponent = 0.5 + sens * 0.9
    const stretched = Math.pow(baseSim, exponent)
    return Math.max(0, Math.min(100, Math.round(stretched * 100)))
  }

  return Math.max(0, Math.min(100, Math.round(baseSim * 100)))
}
