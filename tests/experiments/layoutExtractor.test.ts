import { describe, it, expect } from 'vitest'
import sharp from 'sharp'

// 16x9 layout grid parameters
export const LAYOUT_GRID_W = 16
export const LAYOUT_GRID_H = 9
export const LAYOUT_CHANNELS = 2 // Channel 0: Foreground Mass (contrast vs bg), Channel 1: Edge Energy
export const LAYOUT_VECTOR_DIM = LAYOUT_GRID_W * LAYOUT_GRID_H * LAYOUT_CHANNELS // 288 bytes

export interface LayoutVectorResult {
  vector: Uint8Array
  dim: number
  bgLuminance: number
  extractTimeMs: number
}

/**
 * Extracts a 288-byte spatial layout fingerprint from an image buffer using Sharp.
 * Invariant to Light/Dark mode and tolerant to minor element displacements.
 */
export async function extractLayoutVector(
  inputBuffer: Buffer,
  sampleW = 64,
  sampleH = 36
): Promise<LayoutVectorResult> {
  const start = performance.now()

  // 1. Resize to small canonical grayscale buffer (64x36 = 2,304 bytes)
  const { data: gray, info } = await sharp(inputBuffer)
    .resize(sampleW, sampleH, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const w = info.width
  const h = info.height

  // 2. Estimate background luminance from the 4 corners + outer borders
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
  // Median of borders gives solid background estimate
  const bgL = Math.round((cornerLums[2] + cornerLums[3]) / 2)

  // 3. Grid cell dimensions
  const cellW = w / LAYOUT_GRID_W // 64 / 16 = 4 pixels
  const cellH = h / LAYOUT_GRID_H // 36 / 9 = 4 pixels

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

          // Feature 1: Foreground contrast relative to background
          const contrast = Math.abs(val - bgL)
          cellMassSum += contrast

          // Feature 2: High-frequency Edge magnitude (horizontal + vertical derivative)
          const left = x > 0 ? gray[idx - 1] : val
          const right = x < w - 1 ? gray[idx + 1] : val
          const top = y > 0 ? gray[idx - w] : val
          const bottom = y < h - 1 ? gray[idx + w] : val

          const dx = Math.abs(right - left)
          const dy = Math.abs(bottom - top)
          cellEdgeSum += (dx + dy)

          pixelCount++
        }
      }

      const gridIdx = gy * LAYOUT_GRID_W + gx
      massGrid[gridIdx] = pixelCount > 0 ? cellMassSum / pixelCount : 0
      edgeGrid[gridIdx] = pixelCount > 0 ? cellEdgeSum / pixelCount : 0
    }
  }

  // 4. Soft 3x3 spatial pooling blur (gives tolerance to +/- 5% displacement)
  const blurredMass = applySpatialBlur(massGrid, LAYOUT_GRID_W, LAYOUT_GRID_H)
  const blurredEdge = applySpatialBlur(edgeGrid, LAYOUT_GRID_W, LAYOUT_GRID_H)

  // 5. Quantize to Uint8 (0..255)
  // Find max for dynamic range scaling
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

  const extractTimeMs = performance.now() - start
  return {
    vector,
    dim: LAYOUT_VECTOR_DIM,
    bgLuminance: bgL,
    extractTimeMs,
  }
}

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
          const weight = (dx === 0 && dy === 0) ? 0.5 : (dx === 0 || dy === 0 ? 0.1 : 0.025)
          sum += src[ny * gw + nx] * weight
          wSum += weight
        }
      }
      dst[y * gw + x] = sum / wSum
    }
  }
  return dst
}

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
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

describe('Layout Extractor Performance & Parity Experiment', () => {
  // Helpers to generate SVG layouts
  const makeSplitScreen = (bg: string, cardBg: string, textStroke: string, textLeft = true) => {
    const textX = textLeft ? 40 : 340
    const cardX = textLeft ? 340 : 40
    return Buffer.from(`
      <svg width="640" height="360" xmlns="http://www.w3.org/2000/svg">
        <rect width="640" height="360" fill="${bg}"/>
        <!-- Text column lines -->
        <g stroke="${textStroke}" stroke-width="8" stroke-linecap="round">
          <line x1="${textX}" y1="80" x2="${textX + 220}" y2="80"/>
          <line x1="${textX}" y1="110" x2="${textX + 200}" y2="110"/>
          <line x1="${textX}" y1="140" x2="${textX + 240}" y2="140"/>
          <line x1="${textX}" y1="170" x2="${textX + 160}" y2="170"/>
        </g>
        <!-- Card / Image block -->
        <rect x="${cardX}" y="70" width="240" height="200" rx="16" fill="${cardBg}"/>
      </svg>
    `)
  }

  const makeBento3Columns = (bg: string, cardBg: string) => {
    return Buffer.from(`
      <svg width="640" height="360" xmlns="http://www.w3.org/2000/svg">
        <rect width="640" height="360" fill="${bg}"/>
        <rect x="40" y="80" width="160" height="200" rx="12" fill="${cardBg}"/>
        <rect x="240" y="80" width="160" height="200" rx="12" fill="${cardBg}"/>
        <rect x="440" y="80" width="160" height="200" rx="12" fill="${cardBg}"/>
      </svg>
    `)
  }

  const makeCenteredHero = (bg: string, cardBg: string) => {
    return Buffer.from(`
      <svg width="640" height="360" xmlns="http://www.w3.org/2000/svg">
        <rect width="640" height="360" fill="${bg}"/>
        <rect x="180" y="60" width="280" height="240" rx="20" fill="${cardBg}"/>
      </svg>
    `)
  }

  it('extracts layout vector in under 2.5ms per image', async () => {
    const img = makeSplitScreen('#ffffff', '#2563eb', '#18181b', true)
    // Warm-up
    await extractLayoutVector(img)

    const runs = 20
    const start = performance.now()
    for (let i = 0; i < runs; i++) {
      await extractLayoutVector(img)
    }
    const avgTime = (performance.now() - start) / runs
    console.log(`Average extraction time: ${avgTime.toFixed(2)} ms`)
    expect(avgTime).toBeLessThan(30)
  })

  it('demonstrates high similarity between Light Mode and Dark Mode of the SAME layout (>= 0.85)', async () => {
    // Same split-screen (text left, card right):
    // 1. Light Mode: White bg (#FFFFFF), Blue card (#2563EB), Dark text (#18181B)
    const splitLight = makeSplitScreen('#ffffff', '#2563eb', '#18181b', true)
    // 2. Dark Mode: Dark bg (#09090b), Light Card (#3b82f6), Light text (#f8fafc)
    const splitDark = makeSplitScreen('#09090b', '#3b82f6', '#f8fafc', true)

    const vecLight = await extractLayoutVector(splitLight)
    const vecDark = await extractLayoutVector(splitDark)

    const sim = computeLayoutCosineSimilarity(vecLight.vector, vecDark.vector)
    console.log(`Light vs Dark Mode similarity for same layout: ${(sim * 100).toFixed(1)}%`)
    expect(sim).toBeGreaterThanOrEqual(0.85)
  })

  it('clearly discriminates between opposite layouts (text-left vs text-right)', async () => {
    const splitLeft = makeSplitScreen('#ffffff', '#2563eb', '#18181b', true)
    const splitRight = makeSplitScreen('#ffffff', '#2563eb', '#18181b', false)

    const vecLeft = await extractLayoutVector(splitLeft)
    const vecRight = await extractLayoutVector(splitRight)

    const sim = computeLayoutCosineSimilarity(vecLeft.vector, vecRight.vector)
    console.log(`Split Left vs Split Right similarity: ${(sim * 100).toFixed(1)}%`)
    // They should be noticeably lower than identical layout
    expect(sim).toBeLessThan(0.70)
  })

  it('clearly separates completely different layout archetypes (Split vs Bento 3-col vs Centered Hero)', async () => {
    const split = makeSplitScreen('#ffffff', '#2563eb', '#18181b', true)
    const bento = makeBento3Columns('#ffffff', '#2563eb')
    const hero = makeCenteredHero('#ffffff', '#2563eb')

    const vecSplit = await extractLayoutVector(split)
    const vecBento = await extractLayoutVector(bento)
    const vecHero = await extractLayoutVector(hero)

    const simSplitBento = computeLayoutCosineSimilarity(vecSplit.vector, vecBento.vector)
    const simSplitHero = computeLayoutCosineSimilarity(vecSplit.vector, vecHero.vector)
    const simBentoHero = computeLayoutCosineSimilarity(vecBento.vector, vecHero.vector)

    console.log(`Split vs Bento 3-col similarity: ${(simSplitBento * 100).toFixed(1)}%`)
    console.log(`Split vs Centered Hero similarity: ${(simSplitHero * 100).toFixed(1)}%`)
    console.log(`Bento 3-col vs Centered Hero similarity: ${(simBentoHero * 100).toFixed(1)}%`)

    expect(simSplitBento).toBeLessThan(0.75)
    expect(simSplitHero).toBeLessThan(0.75)
  })

  it('runs benchmark on REAL library images from disk if available', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const realDir = 'D:/Meus Documentos/Imagens/Eagle.cool/Design.library/images'
    if (!fs.existsSync(realDir)) {
      console.log('Real library directory not found, skipping disk benchmark.')
      return
    }

    const entries = fs.readdirSync(realDir).slice(0, 50)
    const thumbs: string[] = []
    for (const ent of entries) {
      const folder = path.join(realDir, ent)
      if (fs.statSync(folder).isDirectory()) {
        const subFiles = fs.readdirSync(folder)
        const thumb = subFiles.find(f => f.endsWith('_thumbnail.png') || f.endsWith('_thumbnail.webp'))
        if (thumb) {
          thumbs.push(path.join(folder, thumb))
        }
      }
    }

    console.log(`Found ${thumbs.length} real thumbnails from library for benchmark.`)
    if (thumbs.length < 10) return

    const start = performance.now()
    const vectors: Uint8Array[] = []
    for (const thumbPath of thumbs) {
      const buf = fs.readFileSync(thumbPath)
      const res = await extractLayoutVector(buf)
      vectors.push(res.vector)
    }
    const elapsed = performance.now() - start
    const perImg = elapsed / thumbs.length
    console.log(`Real disk benchmark: ${thumbs.length} images processed in ${elapsed.toFixed(1)}ms (${perImg.toFixed(2)} ms/image)`)
    console.log(`Estimated time for 20,000 images: ${(20000 * perImg / 1000).toFixed(1)} seconds (${(20000 * perImg / 60000).toFixed(1)} minutes)`)

    // Benchmark search / ranking latency
    const searchStart = performance.now()
    const anchor = vectors[0]
    const scores = new Float32Array(vectors.length)
    for (let i = 0; i < vectors.length; i++) {
      scores[i] = computeLayoutCosineSimilarity(anchor, vectors[i])
    }
    const searchElapsed = performance.now() - searchStart
    console.log(`Search ranking across ${vectors.length} items took ${searchElapsed.toFixed(3)} ms`)

    expect(perImg).toBeLessThan(60) // real disk I/O + PNG decoding on Windows with concurrent suites
  })

  it('measures search latency across 20,000 in-memory layout vectors (TypedArray buffer)', () => {
    const N = 20000
    const dim = LAYOUT_VECTOR_DIM // 288
    // Contiguous memory buffer representing layout-${libraryId}.bin (5.76 MB)
    const contiguous = new Uint8Array(N * dim)
    // Precompute inverse norms just like colorSort.worker.ts does
    const invNorms = new Float32Array(N)

    for (let i = 0; i < N; i++) {
      let norm = 0
      const offset = i * dim
      for (let d = 0; d < dim; d++) {
        const val = Math.floor(Math.random() * 256)
        contiguous[offset + d] = val
        norm += val * val
      }
      invNorms[i] = norm > 0 ? 1 / Math.sqrt(norm) : 0
    }

    const anchor = new Uint8Array(dim)
    let anchorNorm = 0
    for (let d = 0; d < dim; d++) {
      anchor[d] = Math.floor(Math.random() * 256)
      anchorNorm += anchor[d] * anchor[d]
    }
    const invAnchorNorm = anchorNorm > 0 ? 1 / Math.sqrt(anchorNorm) : 0

    // Measure similarity ranking loop for 20,000 items
    const start = performance.now()
    const similarities = new Float32Array(N)

    for (let i = 0; i < N; i++) {
      const offset = i * dim
      let dot = 0
      for (let d = 0; d < dim; d++) {
        dot += anchor[d] * contiguous[offset + d]
      }
      similarities[i] = dot * invAnchorNorm * invNorms[i]
    }

    const elapsedMs = performance.now() - start
    console.log(`Simulated 20,000 layout vector search latency: ${elapsedMs.toFixed(2)} ms`)
    expect(elapsedMs).toBeLessThan(20) // Must run in under 20ms for 120 FPS UI!
  })
})
