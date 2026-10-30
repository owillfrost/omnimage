import { describe, it, expect } from 'vitest'
import {
  extractLayoutFromRgba,
  extractLayoutV2FromRgba,
  computeLayoutCosineSimilarity,
  computeMirrorTolerantCosine,
} from '../../src/core/layoutExtractor'

describe('Layout Extractor v2 Improvements & Validation', () => {
  it('demonstrates that v2 catches isoluminant color boundaries that v1 missed', async () => {
    // Construct a synthetic image where foreground (reddish) and background (greenish)
    // have the EXACT same rounded Rec. 601 grayscale luminance:
    // Background: Greenish (R=0, G=100, B=0) -> 0.587 * 100 = 58.7 -> round = 59
    // Foreground: Reddish (R=196, G=0, B=0) -> 0.299 * 196 = 58.6 -> round = 59
    const w = 64
    const h = 36
    const rgba = new Uint8Array(w * h * 4)

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4
        const isCenter = x >= 20 && x <= 44 && y >= 10 && y <= 26
        if (isCenter) {
          rgba[idx] = 196 // R
          rgba[idx + 1] = 0 // G
          rgba[idx + 2] = 0 // B
          rgba[idx + 3] = 255 // A
        } else {
          rgba[idx] = 0   // R
          rgba[idx + 1] = 100 // G
          rgba[idx + 2] = 0   // B
          rgba[idx + 3] = 255 // A
        }
      }
    }

    // Run v1 (grayscale-based)
    const v1 = extractLayoutFromRgba(rgba, w, h)
    let v1EnergySum = 0
    for (let i = 0; i < v1.vector.length; i++) v1EnergySum += v1.vector[i]

    // In v1, because grayscale luminance of red and green is identical (both = 59),
    // v1 is completely blind to the center rectangle (all zeros)!
    expect(v1EnergySum).toBe(0)

    // Run v2 (Redmean color distance + RGB multi-channel Sobel)
    const v2 = extractLayoutV2FromRgba(rgba, w, h)
    let v2EnergySum = 0
    for (let i = 0; i < v2.vector.length; i++) v2EnergySum += v2.vector[i]

    // v2 successfully registers strong perceptual mass and clean color edges!
    expect(v2EnergySum).toBeGreaterThan(5000)
  })

  it('demonstrates that flat/monochrome images have stable zero-norm vectors in v2 without noise amplification', () => {
    const w = 64
    const h = 36
    // Pure white canvas with a single tiny 1-pixel noise artifact
    const blankRgba = new Uint8Array(w * h * 4).fill(255)
    // Add tiny 1-pixel compression artifact
    blankRgba[100] = 252

    const res = extractLayoutV2FromRgba(blankRgba, w, h)

    // In v2, because contrast is below MIN_MASS_FLOOR (20), it is classified as flat
    // and vector is cleanly zeroed instead of amplifying the single 3-unit noise pixel to 255
    let sum = 0
    for (let i = 0; i < res.vector.length; i++) sum += res.vector[i]
    expect(sum).toBe(0)

    // Two blank images match each other 100%
    const blankSim = computeLayoutCosineSimilarity(res.vector, res.vector)
    expect(blankSim).toBe(1.0)

    // A blank image and a structured vector match 0%
    const structuredVec = new Uint8Array(288).fill(128)
    const crossSim = computeLayoutCosineSimilarity(res.vector, structuredVec)
    expect(crossSim).toBe(0.0)
  })

  it('demonstrates horizontal mirror flip and mirror-tolerant cosine similarity', () => {
    // Construct a left-sided layout vector (energy in left half: columns 0..7)
    const leftVec = new Uint8Array(288)
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 8; x++) {
        leftVec[(y * 16 + x) * 2] = 200     // Channel 0
        leftVec[(y * 16 + x) * 2 + 1] = 180 // Channel 1
      }
    }

    // Construct a right-sided layout vector (energy in right half: columns 8..15)
    const rightVec = new Uint8Array(288)
    for (let y = 0; y < 9; y++) {
      for (let x = 8; x < 16; x++) {
        rightVec[(y * 16 + x) * 2] = 200     // Channel 0
        rightVec[(y * 16 + x) * 2 + 1] = 180 // Channel 1
      }
    }

    // In strict mode (UI design): left vs right is asymmetric and has low similarity
    const strictSim = computeLayoutCosineSimilarity(leftVec, rightVec)
    expect(strictSim).toBe(0) // completely disjoint halves

    // In mirror-tolerant mode (Photography / Art framing):
    const mirrorSim = computeMirrorTolerantCosine(leftVec, rightVec)
    expect(mirrorSim).toBeGreaterThanOrEqual(0.99) // recognized as mirrored twin!
  })
})
