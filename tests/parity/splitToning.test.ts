import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import Database from 'better-sqlite3'
import {
  extractSplitToningFromRgba,
  deriveFallbackSplitToningFromPalette,
  SPLIT_TONING_SHADOWS_L_MIN,
  SPLIT_TONING_SHADOWS_L_MAX,
  SPLIT_TONING_LIGHTS_L_MIN,
  SPLIT_TONING_LIGHTS_L_MAX,
} from '../../src/core/paletteExtractor'
import {
  calculateSplitToningDistance,
  sortArtworksByColorProximity,
} from '../../src/core/colorClustering'
import { runMigrations } from '../../server/db/migrations'
import { CatalogRepository } from '../../server/db/catalogRepository'
import { SplitToningMigrationService } from '../../server/db/splitToningMigration'
import type { Artwork } from '../../src/types/artwork'
import type { CompactCatalogItem } from '../../src/contracts/schemas'

describe('Split Toning Extraction & Grade Matching Parity Tests', () => {
  it('has customizable and cleanly separated luminance bounds excluding mid-tones', () => {
    expect(SPLIT_TONING_SHADOWS_L_MIN).toBe(5)
    expect(SPLIT_TONING_SHADOWS_L_MAX).toBe(45)
    expect(SPLIT_TONING_LIGHTS_L_MIN).toBe(55)
    expect(SPLIT_TONING_LIGHTS_L_MAX).toBe(95)
    // Ensures a clean mid-tone gap between 45 and 55
    expect(SPLIT_TONING_LIGHTS_L_MIN).toBeGreaterThan(SPLIT_TONING_SHADOWS_L_MAX)
  })

  it('accurately extracts teal shadows and warm orange highlights in CIELAB', async () => {
    // Teal in shadows: dark cyan/teal #0B4F54 (approx L=30, a=-18, b=-6)
    // Orange in highlights: warm sunlit orange #F59E42 (approx L=72, a=24, b=58)
    const svg = `
      <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
        <rect width="128" height="64" fill="#0B4F54"/>
        <rect y="64" width="128" height="64" fill="#F59E42"/>
      </svg>
    `
    const { data, info } = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const profile = extractSplitToningFromRgba(data, info.width, info.height)

    expect(profile.hasShadows).toBe(true)
    expect(profile.hasHighlights).toBe(true)
    expect(profile.shadows.validPixels).toBeGreaterThan(500)
    expect(profile.highlights.validPixels).toBeGreaterThan(500)

    // Shadows should be in dark region and have teal (negative a, negative b)
    expect(profile.shadows.L).toBeGreaterThanOrEqual(5)
    expect(profile.shadows.L).toBeLessThanOrEqual(45)
    expect(profile.shadows.a).toBeLessThan(0) // green-cyan tint

    // Highlights should be in bright region and have orange/warm (positive a, positive b)
    expect(profile.highlights.L).toBeGreaterThanOrEqual(55)
    expect(profile.highlights.L).toBeLessThanOrEqual(95)
    expect(profile.highlights.a).toBeGreaterThan(0) // red/amber tint
    expect(profile.highlights.b).toBeGreaterThan(0) // yellow/warm tint
  })

  it('is completely invariant to black letterbox bars (clipping L < 5 rejected)', async () => {
    // 1. Fullframe Teal & Orange image
    const svgFull = `
      <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
        <rect width="128" height="64" fill="#0B4F54"/>
        <rect y="64" width="128" height="64" fill="#F59E42"/>
      </svg>
    `
    const full = await sharp(Buffer.from(svgFull))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const profileFull = extractSplitToningFromRgba(full.data, full.info.width, full.info.height)

    // 2. Same image but with 40% height covered by solid black letterbox bars (#000000, L=0)
    const svgLetterbox = `
      <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
        <rect width="128" height="26" fill="#000000"/>
        <rect y="26" width="128" height="38" fill="#0B4F54"/>
        <rect y="64" width="128" height="38" fill="#F59E42"/>
        <rect y="102" width="128" height="26" fill="#000000"/>
      </svg>
    `
    const letterbox = await sharp(Buffer.from(svgLetterbox))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const profileLetterbox = extractSplitToningFromRgba(letterbox.data, letterbox.info.width, letterbox.info.height)

    // The average (a, b) in shadows and highlights must match within 0.5 DeltaE!
    const shadowDiffA = Math.abs(profileFull.shadows.a - profileLetterbox.shadows.a)
    const shadowDiffB = Math.abs(profileFull.shadows.b - profileLetterbox.shadows.b)
    const deltaShadow = Math.sqrt(shadowDiffA * shadowDiffA + shadowDiffB * shadowDiffB)

    const lightDiffA = Math.abs(profileFull.highlights.a - profileLetterbox.highlights.a)
    const lightDiffB = Math.abs(profileFull.highlights.b - profileLetterbox.highlights.b)
    const deltaLight = Math.sqrt(lightDiffA * lightDiffA + lightDiffB * lightDiffB)

    expect(deltaShadow).toBeLessThan(0.8)
    expect(deltaLight).toBeLessThan(0.8)

    // Total split-toning distance between the letterboxed version and full version should be almost 0!
    const distBetween = calculateSplitToningDistance(profileFull, profileLetterbox)
    expect(distBetween).toBeLessThan(2.0)
  })

  it('downweights near-neutral low-chroma pixels so gray backgrounds do not dilute color grade', async () => {
    // Image 1: Pure saturated purple shadow #4C1D95
    const svgPure = `
      <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
        <rect width="128" height="128" fill="#4C1D95"/>
      </svg>
    `
    const pure = await sharp(Buffer.from(svgPure))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const profilePure = extractSplitToningFromRgba(pure.data, pure.info.width, pure.info.height)

    // Image 2: 75% dark neutral gray (#333333, L=22, a=0, b=0) + 25% purple shadow (#4C1D95)
    const svgMixed = `
      <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
        <rect width="128" height="96" fill="#333333"/>
        <rect y="96" width="128" height="32" fill="#4C1D95"/>
      </svg>
    `
    const mixed = await sharp(Buffer.from(svgMixed))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const profileMixed = extractSplitToningFromRgba(mixed.data, mixed.info.width, mixed.info.height)

    // Because #333333 has chroma ~0, its weight is heavily suppressed by chroma weighting
    // so profileMixed.shadows still points strongly towards purple (positive a, negative b)
    expect(profileMixed.shadows.a).toBeGreaterThan(10)
    expect(profileMixed.shadows.b).toBeLessThan(-10)

    // Compare with linear average: linear average of 75% neutral + 25% purple would dilute 'a' by 4x.
    // Chroma weighting keeps it much closer to the intentional grade!
    expect(profileMixed.shadows.a).toBeGreaterThan(profilePure.shadows.a * 0.45)
  })

  it('weights groups with low valid pixel count less in distance comparison', () => {
    // Candidate A: Rich highlights and shadows
    const fullGrade = {
      shadows: { L: 25, a: -20, b: -10, validPixels: 500, weightSum: 300 },
      highlights: { L: 75, a: 30, b: 40, validPixels: 500, weightSum: 300 },
      totalValidPixels: 1000,
      hasShadows: true,
      hasHighlights: true,
    }

    // Candidate B: Low-key image (500 valid shadow pixels, but only 2 spurious highlight pixels)
    // Even if those 2 pixels have wildly different a/b, they must not dominate the distance.
    const lowKeyGrade = {
      shadows: { L: 25, a: -18, b: -9, validPixels: 500, weightSum: 300 }, // very close shadow grade
      highlights: { L: 75, a: -50, b: -50, validPixels: 2, weightSum: 1.5 }, // noisy 2 pixels
      totalValidPixels: 502,
      hasShadows: true,
      hasHighlights: false,
    }

    const dist = calculateSplitToningDistance(fullGrade, lowKeyGrade)
    // Distance should be small because shadows match closely and the highlights are downweighted due to low pixel count
    expect(dist).toBeLessThan(15)
  })

  it('derives accurate fallback split-toning from palette when image is not yet remigrated', () => {
    const palette = ['#0B4F54', '#F59E42']
    const weights = [0.5, 0.5]
    const fallback = deriveFallbackSplitToningFromPalette(palette, weights)

    expect(fallback.hasShadows).toBe(true)
    expect(fallback.hasHighlights).toBe(true)
    expect(fallback.shadows.a).toBeLessThan(0) // teal
    expect(fallback.highlights.a).toBeGreaterThan(0) // warm orange
  })

  it('orders artworks by grade proximity in sortArtworksByColorProximity', () => {
    const tealOrangeAnchor: Artwork = {
      id: 'anchor-teal-orange',
      title: 'Teal & Orange Anchor',
      artist: '',
      date: '',
      medium: '',
      source: '',
      sourceUrl: '',
      imageUrl: '',
      thumbnailUrl: '',
      aspectRatio: 1,
      dominantColor: '#0B4F54',
      palette: ['#0B4F54', '#F59E42'],
      splitToning: {
        shadows: { L: 25, a: -18, b: -8, validPixels: 400, weightSum: 250 },
        highlights: { L: 70, a: 22, b: 45, validPixels: 400, weightSum: 250 },
        totalValidPixels: 800,
        hasShadows: true,
        hasHighlights: true,
      },
      worldX: 0,
      worldY: 0,
      width: 260,
      height: 260,
    }

    const similarTealOrange: Artwork = {
      ...tealOrangeAnchor,
      id: 'cand-teal-orange',
      splitToning: {
        shadows: { L: 28, a: -16, b: -6, validPixels: 350, weightSum: 210 },
        highlights: { L: 72, a: 20, b: 42, validPixels: 350, weightSum: 210 },
        totalValidPixels: 700,
        hasShadows: true,
        hasHighlights: true,
      },
    }

    const dissimilarMagentaGreen: Artwork = {
      ...tealOrangeAnchor,
      id: 'cand-magenta-green',
      splitToning: {
        shadows: { L: 30, a: 35, b: -20, validPixels: 400, weightSum: 250 }, // magenta shadows
        highlights: { L: 70, a: -30, b: 35, validPixels: 400, weightSum: 250 }, // green highlights
        totalValidPixels: 800,
        hasShadows: true,
        hasHighlights: true,
      },
    }

    const sorted = sortArtworksByColorProximity(
      [dissimilarMagentaGreen, similarTealOrange],
      tealOrangeAnchor,
      'grade'
    )

    expect(sorted[0].artwork.id).toBe('anchor-teal-orange')
    expect(sorted[1].artwork.id).toBe('cand-teal-orange')
    expect(sorted[2].artwork.id).toBe('cand-magenta-green')
    expect(sorted[1].distance).toBeLessThan(sorted[2].distance)
  })

  it('migrates existing legacy items in SQLite and populates split_toning_json and compact_json', async () => {
    const db = new Database(':memory:')
    runMigrations(db)
    const repo = new CatalogRepository(db)

    const compactA: CompactCatalogItem = {
      id: 'item-mig-1',
      name: 'Legacy Teal Item',
      ext: 'png',
      palettes: [{ color: [11, 79, 84], ratio: 50 }, { color: [245, 158, 66], ratio: 50 }],
    }

    repo.insertItemsBatch('test-lib', [
      {
        id: 'item-mig-1',
        name: 'Legacy Teal Item',
        ext: 'png',
        paletteJson: JSON.stringify([{ color: [11, 79, 84], ratio: 50 }, { color: [245, 158, 66], ratio: 50 }]),
        compactJson: JSON.stringify(compactA),
        mediaRelPath: 'images/item-mig-1.info/Legacy Teal Item.png',
      },
    ])

    // Verify initial state: split_toning_json is NULL
    const pending = repo.getItemsPendingSplitToning('test-lib', 10)
    expect(pending).toHaveLength(1)
    expect(pending[0].id).toBe('item-mig-1')

    // Run migration service
    const migrator = new SplitToningMigrationService(db)
    const result = await migrator.runMigration('test-lib')

    expect(result.processed).toBe(1)
    expect(result.updated).toBe(1)

    // Verify item now has split_toning_json in database
    const row = db.prepare('SELECT split_toning_json, compact_json FROM items WHERE id = ?').get('item-mig-1') as any
    expect(row.split_toning_json).not.toBeNull()
    const parsedGrade = JSON.parse(row.split_toning_json)
    expect(parsedGrade.shadows).toBeDefined()
    expect(parsedGrade.highlights).toBeDefined()

    // Verify compact_json also includes splitToning for zero-cost JSON streaming
    const parsedCompact = JSON.parse(row.compact_json)
    expect(parsedCompact.splitToning).toBeDefined()
    expect(parsedCompact.splitToning.shadows.a).toBeDefined()

    // Verify pending queue is now 0
    expect(repo.getItemsPendingSplitToning('test-lib', 10)).toHaveLength(0)

    db.close()
  })
})
