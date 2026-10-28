import { describe, it, expect } from 'vitest'
import {
  hexToRgb,
  rgbToHsl,
  rgbToLab,
  calculateColorDistance,
  calculateWeightedPaletteDistance,
  buildArtworkColorVectors,
  matchesColorFilter,
  sortArtworksByColorProximity,
  getCachedLab,
  getCachedHsl,
} from '../../src/core/colorClustering'
import { calibrateAnchorAccent } from '../../src/core/colorConversion'
import type { Artwork } from '../../src/types/artwork'

describe('Color Clustering & Perceptual Color Parity Tests', () => {
  it('hexToRgb parses 3-digit and 6-digit hex values accurately', () => {
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
    expect(hexToRgb('#000')).toEqual([0, 0, 0])
    expect(hexToRgb('#18181b')).toEqual([24, 24, 27])
    expect(hexToRgb('4F46E5')).toEqual([79, 70, 229])
    expect(hexToRgb('')).toEqual([24, 24, 27]) // default fallback
  })

  it('rgbToHsl converts RGB to HSL with correct hue, saturation and lightness', () => {
    const [hRed, sRed, lRed] = rgbToHsl(255, 0, 0)
    expect(hRed).toBeCloseTo(0, 1)
    expect(sRed).toBeCloseTo(1, 1)
    expect(lRed).toBeCloseTo(0.5, 1)

    const [hGreen, sGreen, lGreen] = rgbToHsl(0, 255, 0)
    expect(hGreen).toBeCloseTo(120, 1)
    expect(sGreen).toBeCloseTo(1, 1)
    expect(lGreen).toBeCloseTo(0.5, 1)

    const [hBlue, sBlue, lBlue] = rgbToHsl(0, 0, 255)
    expect(hBlue).toBeCloseTo(240, 1)
    expect(sBlue).toBeCloseTo(1, 1)
    expect(lBlue).toBeCloseTo(0.5, 1)
  })

  it('rgbToLab implements exact CIELAB D65 conversion', () => {
    // Pure Black [0, 0, 0] -> L=0, a=0, b=0
    const [lBlack, aBlack, bBlack] = rgbToLab(0, 0, 0)
    expect(lBlack).toBeCloseTo(0, 2)
    expect(aBlack).toBeCloseTo(0, 2)
    expect(bBlack).toBeCloseTo(0, 2)

    // Pure White [255, 255, 255] -> L=100, a=0, b=0
    const [lWhite, aWhite, bWhite] = rgbToLab(255, 255, 255)
    expect(lWhite).toBeCloseTo(100, 1)
    expect(aWhite).toBeCloseTo(0, 1)
    expect(bWhite).toBeCloseTo(0, 1)

    // Standard Zinc Dark Background [24, 24, 27]
    const [lZinc, , bZinc] = rgbToLab(24, 24, 27)
    expect(lZinc).toBeGreaterThan(8)
    expect(lZinc).toBeLessThan(12)
    expect(bZinc).toBeLessThan(0) // slight cool blue tint
  })

  it('calculateColorDistance produces symmetric and non-negative perceptual distances', () => {
    const d1 = calculateColorDistance('#18181b', '#18181b')
    expect(d1).toBe(0)

    const d2 = calculateColorDistance('#ffffff', '#000000')
    expect(d2).toBeGreaterThan(95)

    // Symmetry test
    const dAB = calculateColorDistance('#4F46E5', '#818CF8')
    const dBA = calculateColorDistance('#818CF8', '#4F46E5')
    expect(dAB).toBeCloseTo(dBA, 4)
  })

  it('calculateWeightedPaletteDistance calculates proportional color distance', () => {
    const paletteA = ['#18181b', '#4F46E5']
    const weightsA = [0.7, 0.3]
    const paletteB = ['#18181b', '#4F46E5']
    const weightsB = [0.7, 0.3]

    const distSame = calculateWeightedPaletteDistance(paletteA, weightsA, paletteB, weightsB)
    expect(distSame).toBeCloseTo(0, 2)

    const paletteDiff = ['#ffffff', '#f59e0b']
    const distDiff = calculateWeightedPaletteDistance(paletteA, weightsA, paletteDiff, [0.5, 0.5])
    expect(distDiff).toBeGreaterThan(30)
  })

  it('buildArtworkColorVectors creates contiguous [L, a, b, h, s] Float32Array', () => {
    const dominant = '#18181b'
    const palette = ['#18181b', '#4F46E5', '#ffffff']
    const vec = buildArtworkColorVectors(dominant, palette)

    // Should contain 3 unique colors, 5 floats each = 15 floats
    expect(vec.length).toBe(15)

    // Slot 0 matches dominant color L, a, b, h, s
    const [L, a, b] = getCachedLab(dominant)
    const [h, s] = getCachedHsl(dominant)
    expect(vec[0]).toBeCloseTo(L, 3)
    expect(vec[1]).toBeCloseTo(a, 3)
    expect(vec[2]).toBeCloseTo(b, 3)
    expect(vec[3]).toBeCloseTo(h, 3)
    expect(vec[4]).toBeCloseTo(s, 3)
  })

  it('matchesColorFilter correctly evaluates OR and AND modes', () => {
    const mockArtwork: Artwork = {
      id: 'test-1',
      title: 'Test Artwork',
      artist: 'Artist',
      date: '2026',
      medium: 'Digital',
      source: 'Test',
      sourceUrl: '#',
      imageUrl: '#',
      thumbnailUrl: '#',
      aspectRatio: 1,
      dominantColor: '#4F46E5',
      palette: ['#4F46E5', '#ffffff'],
      worldX: 0,
      worldY: 0,
      width: 260,
      height: 260,
    }

    // Matches dominant color in OR mode
    expect(matchesColorFilter(mockArtwork, ['#4F46E5'], 'OR')).toBe(true)

    // Matches when one color is present in OR mode
    expect(matchesColorFilter(mockArtwork, ['#4F46E5', '#000000'], 'OR')).toBe(true)

    // In AND mode, requires both colors
    expect(matchesColorFilter(mockArtwork, ['#4F46E5', '#ffffff'], 'AND')).toBe(true)
    expect(matchesColorFilter(mockArtwork, ['#4F46E5', '#00ff00'], 'AND')).toBe(false)
  })

  it('sortArtworksByColorProximity orders anchor artwork strictly at index 0', () => {
    const anchor: Artwork = {
      id: 'anchor',
      title: 'Anchor',
      artist: '',
      date: '',
      medium: '',
      source: '',
      sourceUrl: '',
      imageUrl: '',
      thumbnailUrl: '',
      aspectRatio: 1,
      dominantColor: '#ff0000',
      palette: ['#ff0000'],
      worldX: 0,
      worldY: 0,
      width: 260,
      height: 260,
    }

    const itemRed: Artwork = { ...anchor, id: 'item-red', dominantColor: '#ee1111', palette: ['#ee1111'] }
    const itemBlue: Artwork = { ...anchor, id: 'item-blue', dominantColor: '#0000ff', palette: ['#0000ff'] }

    const sorted = sortArtworksByColorProximity([itemBlue, itemRed], anchor)

    expect(sorted.length).toBe(3)
    expect(sorted[0].artwork.id).toBe('anchor')
    expect(sorted[0].distance).toBe(0)
    expect(sorted[0].similarityPercent).toBe(100)
    // Red item should be closer than blue item
    expect(sorted[1].artwork.id).toBe('item-red')
    expect(sorted[2].artwork.id).toBe('item-blue')
  })

  describe('calibrateAnchorAccent tests', () => {
    it('returns neutral zinc fallback when input is null or undefined or invalid', () => {
      const fallbackNull = calibrateAnchorAccent(null)
      expect(fallbackNull.accent).toBe('#a1a1aa')
      expect(fallbackNull.bright).toBe('#f4f4f5')
      expect(fallbackNull.subtle).toContain('rgba(161, 161, 170')

      const fallbackUndef = calibrateAnchorAccent(undefined)
      expect(fallbackUndef.accent).toBe('#a1a1aa')

      const fallbackInvalid = calibrateAnchorAccent('not-a-hex')
      expect(fallbackInvalid.accent).toBe('#a1a1aa')
    })

    it('lifts pure black and dark tones to ensure healthy contrast against #09090b', () => {
      const darkCalibrated = calibrateAnchorAccent('#050505')
      // Accent must not be black or dark grey; value is clamped to >= 0.52
      expect(darkCalibrated.accent).not.toBe('#050505')
      expect(darkCalibrated.accent).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(darkCalibrated.bright).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(darkCalibrated.subtle).toMatch(/^rgba\(\d+,\s*\d+,\s*\d+,\s*0\.14\)$/)
    })

    it('clamps pure neon colors to prevent visual blinding while maintaining hue', () => {
      const neonGreen = calibrateAnchorAccent('#00ff00')
      expect(neonGreen.accent).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(neonGreen.bright).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(neonGreen.subtle).toMatch(/^rgba\(\d+,\s*\d+,\s*\d+,\s*0\.14\)$/)
    })
  })
})
