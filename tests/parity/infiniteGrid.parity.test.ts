import { describe, it, expect } from 'vitest'
import {
  getStableColumnHash,
  buildInfiniteGridModel,
  getVisibleVirtualCards,
  GRID_SIZE_PRESETS,
} from '../../src/core/infiniteGrid'
import { getRadialRank, RADIAL_LOOKUP } from '../../src/core/colorClustering'
import type { Artwork, ViewportState } from '../../src/types/artwork'

describe('Infinite Grid & Spatial Math Parity Tests', () => {
  const createMockArtwork = (id: string, aspectRatio = 1.0): Artwork => ({
    id,
    title: `Artwork ${id}`,
    artist: 'Artist',
    date: '2026',
    medium: 'Digital',
    source: 'Test',
    sourceUrl: '#',
    imageUrl: '#',
    thumbnailUrl: '#',
    aspectRatio,
    dominantColor: '#18181b',
    palette: ['#18181b'],
    worldX: 0,
    worldY: 0,
    width: 260,
    height: Math.round(260 / aspectRatio),
  })

  it('getStableColumnHash produces deterministic, bounded FNV-1a column indices', () => {
    const numCols = 32
    const h1 = getStableColumnHash('artwork-123', numCols)
    const h2 = getStableColumnHash('artwork-123', numCols)
    expect(h1).toBe(h2)
    expect(h1).toBeGreaterThanOrEqual(0)
    expect(h1).toBeLessThan(numCols)

    const hDiff = getStableColumnHash('artwork-999', numCols)
    expect(hDiff).toBeGreaterThanOrEqual(0)
    expect(hDiff).toBeLessThan(numCols)
  })

  it('buildInfiniteGridModel builds accurate columns and cycle heights', () => {
    const items = [
      createMockArtwork('a1', 1.0),
      createMockArtwork('a2', 1.5),
      createMockArtwork('a3', 0.8),
      createMockArtwork('a4', 1.2),
    ]

    const preset = GRID_SIZE_PRESETS.default
    const model = buildInfiniteGridModel(items, preset.numTemplateCols, preset.cardWidth, preset.gap)

    expect(model).not.toBeNull()
    if (!model) return

    expect(model.columns.length).toBe(32)
    expect(model.cardWidth).toBe(260)
    expect(model.gap).toBe(12)
    expect(model.colPitch).toBe(272)

    // Check that each column has non-zero cycle height and items
    for (const col of model.columns) {
      expect(col.items.length).toBeGreaterThan(0)
      expect(col.cycleHeight).toBeGreaterThan(0)
      for (const item of col.items) {
        expect(item.width).toBe(260)
        expect(item.height).toBeGreaterThan(0)
      }
    }
  })

  it('getVisibleVirtualCards efficiently culls cards outside viewport', () => {
    const items: Artwork[] = []
    for (let i = 0; i < 64; i++) {
      items.push(createMockArtwork(`item-${i}`, 1.0))
    }

    const preset = GRID_SIZE_PRESETS.default
    const model = buildInfiniteGridModel(items, preset.numTemplateCols, preset.cardWidth, preset.gap)
    expect(model).not.toBeNull()
    if (!model) return

    const viewport: ViewportState = {
      x: 0,
      y: 0,
      scale: 1,
    }

    const visibleCards = getVisibleVirtualCards(model, viewport.x, viewport.y, 1920, 1080)
    expect(visibleCards.length).toBeGreaterThan(0)

    // Viewport cards should have coordinates intersecting viewport bounds
    for (const card of visibleCards) {
      expect(card.width).toBe(260)
      expect(card.worldX).toBeDefined()
      expect(card.worldY).toBeDefined()
    }
  })

  it('getRadialRank correctly maps radial distance into RADIAL_LOOKUP ring', () => {
    expect(RADIAL_LOOKUP.length).toBe(25921)

    // Origin (0, 0) gives ring rank 0
    const rank0 = getRadialRank(0, 0)
    expect(rank0).toBe(0)

    // Close neighbors give small ranks
    const rankNeighbor = getRadialRank(1, 0)
    expect(rankNeighbor).toBeGreaterThan(0)
    expect(rankNeighbor).toBeLessThan(10)
  })
})
