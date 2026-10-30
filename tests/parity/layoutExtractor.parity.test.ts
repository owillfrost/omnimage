import { describe, it, expect } from 'vitest'
import {
  LAYOUT_GRID_W,
  LAYOUT_GRID_H,
  LAYOUT_CHANNELS,
  LAYOUT_VECTOR_DIM,
  extractLayoutFromGrayscale,
  extractLayoutFromRgba,
  extractLayoutFromBuffer,
  computeLayoutCosineSimilarity,
  computeQuantizedLayoutCosine,
  calculateLayoutDistance,
  calculateLayoutSimilarityPercent,
} from '../../src/core/layoutExtractor'
import {
  serializeLayoutBinary,
  parseLayoutBinary,
} from '../../src/contracts/binaryFormats'

describe('Layout Extractor & Binary Serialization Parity Tests', () => {
  it('has valid spatial dimension constants', () => {
    expect(LAYOUT_GRID_W).toBe(16)
    expect(LAYOUT_GRID_H).toBe(9)
    expect(LAYOUT_CHANNELS).toBe(2)
    expect(LAYOUT_VECTOR_DIM).toBe(288)
  })

  // Synthetic layout generators
  const makeSplitSvg = (bg: string, cardBg: string, textStroke: string, textLeft = true) => {
    const textX = textLeft ? 40 : 340
    const cardX = textLeft ? 340 : 40
    return Buffer.from(`
      <svg width="640" height="360" xmlns="http://www.w3.org/2000/svg">
        <rect width="640" height="360" fill="${bg}"/>
        <g stroke="${textStroke}" stroke-width="8" stroke-linecap="round">
          <line x1="${textX}" y1="80" x2="${textX + 220}" y2="80"/>
          <line x1="${textX}" y1="110" x2="${textX + 200}" y2="110"/>
          <line x1="${textX}" y1="140" x2="${textX + 240}" y2="140"/>
          <line x1="${textX}" y1="170" x2="${textX + 160}" y2="170"/>
        </g>
        <rect x="${cardX}" y="70" width="240" height="200" rx="16" fill="${cardBg}"/>
      </svg>
    `)
  }

  const makeCenteredHeroSvg = (bg: string, cardBg: string) => {
    return Buffer.from(`
      <svg width="640" height="360" xmlns="http://www.w3.org/2000/svg">
        <rect width="640" height="360" fill="${bg}"/>
        <rect x="180" y="60" width="280" height="240" rx="20" fill="${cardBg}"/>
      </svg>
    `)
  }

  it('extracts layout vector from image Buffer via Sharp', async () => {
    const buf = makeSplitSvg('#ffffff', '#2563eb', '#18181b', true)
    const result = await extractLayoutFromBuffer(buf)

    expect(result.dim).toBe(288)
    expect(result.vector.length).toBe(288)
    expect(result.vector).toBeInstanceOf(Uint8Array)
    expect(result.bgLuminance).toBeGreaterThanOrEqual(240) // white background
  })

  it('demonstrates >= 90% cosine similarity between Dark Mode and Light Mode for identical layout', async () => {
    const lightBuf = makeSplitSvg('#ffffff', '#2563eb', '#18181b', true)
    const darkBuf = makeSplitSvg('#09090b', '#3b82f6', '#f8fafc', true)

    const vecLight = await extractLayoutFromBuffer(lightBuf)
    const vecDark = await extractLayoutBufferOrDirect(darkBuf)

    const sim = computeLayoutCosineSimilarity(vecLight.vector, vecDark.vector)
    expect(sim).toBeGreaterThanOrEqual(0.90)
  })

  async function extractLayoutBufferOrDirect(buf: Buffer) {
    return extractLayoutFromBuffer(buf)
  }

  it('discriminates between opposite layouts (text-left vs text-right)', async () => {
    const leftBuf = makeSplitSvg('#ffffff', '#2563eb', '#18181b', true)
    const rightBuf = makeSplitSvg('#ffffff', '#2563eb', '#18181b', false)

    const vecLeft = await extractLayoutFromBuffer(leftBuf)
    const vecRight = await extractLayoutFromBuffer(rightBuf)

    const sim = computeLayoutCosineSimilarity(vecLeft.vector, vecRight.vector)
    expect(sim).toBeLessThan(0.70)
  })

  it('discriminates between Split screen and Centered Hero', async () => {
    const splitBuf = makeSplitSvg('#ffffff', '#2563eb', '#18181b', true)
    const heroBuf = makeCenteredHeroSvg('#ffffff', '#2563eb')

    const vecSplit = await extractLayoutFromBuffer(splitBuf)
    const vecHero = await extractLayoutFromBuffer(heroBuf)

    const dist = calculateLayoutDistance(vecSplit.vector, vecHero.vector, 16 / 9, 16 / 9)
    expect(dist).toBeGreaterThan(20) // noticeably distant
  })

  it('computes distance in standard Omnimage [0..85] range and maps to similarity percentage', () => {
    const vecA = new Uint8Array(288).fill(120)
    const distZero = calculateLayoutDistance(vecA, vecA, 1.0, 1.0)
    expect(distZero).toBe(0)
    expect(calculateLayoutSimilarityPercent(distZero)).toBe(100)

    const distMax = 85
    expect(calculateLayoutSimilarityPercent(distMax)).toBe(0)

    const distMid = 42.5
    expect(calculateLayoutSimilarityPercent(distMid)).toBe(50)
  })

  it('matches computeQuantizedLayoutCosine parity with invNorms', () => {
    const dim = 288
    const N = 4
    const vecs = new Uint8Array(N * dim)
    const invNorms = new Float32Array(N)

    for (let i = 0; i < N; i++) {
      let norm = 0
      for (let d = 0; d < dim; d++) {
        const val = (i * 37 + d * 13) % 256
        vecs[i * dim + d] = val
        norm += val * val
      }
      invNorms[i] = norm > 0 ? 1 / Math.sqrt(norm) : 0
    }

    const simWithoutInv = computeQuantizedLayoutCosine(vecs, dim, 0, 1)
    const simWithInv = computeQuantizedLayoutCosine(vecs, dim, 0, 1, invNorms)

    expect(Math.abs(simWithoutInv - simWithInv)).toBeLessThan(1e-5)
  })

  it('serializes and parses layout binary packages with zero-copy roundtrip parity and versioning', () => {
    const ids = ['item-001', 'item-002', 'item-003']
    const dim = 288
    const rawVectors = new Uint8Array(ids.length * dim)
    for (let i = 0; i < rawVectors.length; i++) {
      rawVectors[i] = (i * 7) % 256
    }

    const binaryBuffer = serializeLayoutBinary(ids, rawVectors, dim, 2, 2)
    expect(binaryBuffer.byteLength).toBeGreaterThan(ids.length * dim)

    const parsed = parseLayoutBinary(binaryBuffer)
    expect(parsed.version).toBe(2)
    expect(parsed.extractorVersion).toBe(2)
    expect(parsed.ids).toEqual(ids)
    expect(parsed.dim).toBe(dim)
    expect(parsed.vectors.length).toBe(ids.length * dim)
    expect(Array.from(parsed.vectors)).toEqual(Array.from(rawVectors))

    // Check legacy v1 array backward compatibility
    const legacyJson = JSON.stringify(ids)
    const legacyBytes = new TextEncoder().encode(legacyJson)
    const legacyBuf = new ArrayBuffer(4 + legacyBytes.byteLength + rawVectors.byteLength)
    new DataView(legacyBuf).setUint32(0, legacyBytes.byteLength, true)
    new Uint8Array(legacyBuf).set(legacyBytes, 4)
    new Uint8Array(legacyBuf, 4 + legacyBytes.byteLength).set(rawVectors)

    const parsedLegacy = parseLayoutBinary(legacyBuf)
    expect(parsedLegacy.version).toBe(1)
    expect(parsedLegacy.extractorVersion).toBe(1)
    expect(parsedLegacy.ids).toEqual(ids)
    expect(parsedLegacy.dim).toBe(dim)
    expect(Array.from(parsedLegacy.vectors)).toEqual(Array.from(rawVectors))
  })

  it('extracts layout from raw RGBA buffer correctly', () => {
    const w = 16
    const h = 9
    const rgba = new Uint8Array(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = 200     // R
      rgba[i * 4 + 1] = 200 // G
      rgba[i * 4 + 2] = 200 // B
      rgba[i * 4 + 3] = 255 // A
    }

    const res = extractLayoutFromRgba(rgba, w, h)
    expect(res.dim).toBe(288)
    expect(res.vector.length).toBe(288)
  })

  it('extracts layout from raw grayscale buffer correctly', () => {
    const w = 16
    const h = 9
    const gray = new Uint8Array(w * h).fill(128)
    const res = extractLayoutFromGrayscale(gray, w, h)
    expect(res.dim).toBe(288)
    expect(res.vector.length).toBe(288)
    expect(res.bgLuminance).toBe(128)
  })
})
