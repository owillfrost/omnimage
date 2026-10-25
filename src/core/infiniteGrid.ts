import type { Artwork } from '../types/artwork'
import { getRadialRank, type ScoredArtwork } from './colorClustering'

export type GridSizeMode = 'small' | 'default' | 'large'

export interface GridSizePreset {
  label: string
  cardWidth: number
  cardHeight: number
  gap: number
  numTemplateCols: number
  exploreCols: number
}

export const GRID_SIZE_PRESETS: Record<GridSizeMode, GridSizePreset> = {
  small: {
    label: 'Grid Pequeno',
    cardWidth: 180,
    cardHeight: 220,
    gap: 10,
    numTemplateCols: 32,
    exploreCols: 7,
  },
  default: {
    label: 'Grid Padrão',
    cardWidth: 260,
    cardHeight: 320,
    gap: 12,
    numTemplateCols: 32,
    exploreCols: 5,
  },
  large: {
    label: 'Grid Largo',
    cardWidth: 540,
    cardHeight: 660,
    gap: 20,
    numTemplateCols: 32,
    exploreCols: 2,
  },
}

export interface VirtualColumnItem {
  artwork: Artwork
  offsetY: number
  height: number
  width: number
}

export interface VirtualColumn {
  items: VirtualColumnItem[]
  cycleHeight: number
}

export interface InfiniteGridModel {
  columns: VirtualColumn[]
  numTemplateCols: number
  cardWidth: number
  gap: number
  colPitch: number
}

export interface VisibleVirtualCard {
  key: string
  artwork: Artwork
  worldX: number
  worldY: number
  width: number
  height: number
  similarityPercent?: number
  isAnchor?: boolean
  waveDelayMs?: number
  radialDistance?: number
}

/**
 * Builds an infinite repeating column model from an array of artworks.
 * Each column has a cycle of items with calculated heights and cumulative offsets.
 */
/**
 * Fast deterministic FNV-1a hash so each artwork prefers a consistent column
 * across filter adjustments instead of jumping columns whenever an earlier item is filtered out.
 */
export function getStableColumnHash(id: string, numCols: number): number {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % numCols
}

/**
 * Builds an infinite repeating column model from an array of artworks.
 * Uses deterministic column affinity with soft load-balancing so cards stay in their
 * column and glide smoothly vertically when filtering by color.
 */
export function buildInfiniteGridModel(
  artworks: Artwork[],
  numTemplateCols = 32,
  cardWidth = 260,
  gap = 12
): InfiniteGridModel | null {
  if (!artworks || artworks.length === 0) return null

  const colPitch = cardWidth + gap
  const columns: VirtualColumn[] = []

  // Target capacity per column so hash distribution stays balanced even on small filtered sets
  const maxPerCol = Math.max(2, Math.ceil((artworks.length / numTemplateCols) * 1.35))
  const colBuckets: Artwork[][] = Array.from({ length: numTemplateCols }, () => [])

  artworks.forEach((art) => {
    const preferredCol = getStableColumnHash(art.id, numTemplateCols)
    if (colBuckets[preferredCol].length < maxPerCol) {
      colBuckets[preferredCol].push(art)
    } else {
      // Find nearest column with available capacity
      let placed = false
      for (let offset = 1; offset < numTemplateCols; offset++) {
        const candidate = (preferredCol + offset) % numTemplateCols
        if (colBuckets[candidate].length < maxPerCol) {
          colBuckets[candidate].push(art)
          placed = true
          break
        }
      }
      if (!placed) {
        colBuckets[preferredCol].push(art)
      }
    }
  })

  // For any empty column bucket (when total filtered artworks < numTemplateCols), fill with available artworks
  colBuckets.forEach((bucket, cIdx) => {
    if (bucket.length === 0) {
      bucket.push(artworks[cIdx % artworks.length])
    }
  })

  // Build each column with cumulative Y offsets
  for (let c = 0; c < numTemplateCols; c++) {
    const bucket = colBuckets[c]
    let currentY = 0
    const items: VirtualColumnItem[] = []

    for (const art of bucket) {
      const rawAspect = art.aspectRatio || 1.0
      const clampedAspect = Math.max(0.6, Math.min(1.8, rawAspect))
      const height = Math.round(cardWidth / clampedAspect)

      items.push({
        artwork: art,
        offsetY: currentY,
        height,
        width: cardWidth,
      })

      currentY += height + gap
    }

    columns.push({
      items,
      cycleHeight: Math.max(currentY, 600), // ensure non-zero cycle height
    })
  }

  return {
    columns,
    numTemplateCols,
    cardWidth,
    gap,
    colPitch,
  }
}

/**
 * Binary search helper: finds the first item index in a sorted column where offsetY + height >= targetOffsetY.
 */
function findFirstVisibleIndex(items: VirtualColumnItem[], targetOffsetY: number): number {
  let low = 0
  let high = items.length - 1
  let ans = items.length

  while (low <= high) {
    const mid = (low + high) >>> 1
    const item = items[mid]
    if (item.offsetY + item.height >= targetOffsetY) {
      ans = mid
      high = mid - 1
    } else {
      low = mid + 1
    }
  }
  return ans
}

/**
 * Calculates the exact set of visible virtual cards for standard masonry infinite mode.
 * Uses O(log N) binary search per column cycle so 22,000+ items run at 120 FPS with ~75 DOM nodes.
 */
export function getVisibleVirtualCards(
  model: InfiniteGridModel,
  viewportX: number,
  viewportY: number,
  screenWidth: number,
  screenHeight: number,
  buffer = 700
): VisibleVirtualCard[] {
  const result: VisibleVirtualCard[] = []

  // World bounds visible in viewport (including buffer)
  const minWorldX = -viewportX - buffer
  const maxWorldX = screenWidth - viewportX + buffer
  const minWorldY = -viewportY - buffer
  const maxWorldY = screenHeight - viewportY + buffer

  // Calculate visible column index range in world space
  const colMin = Math.floor(minWorldX / model.colPitch)
  const colMax = Math.ceil(maxWorldX / model.colPitch)

  for (let col = colMin; col <= colMax; col++) {
    // Map world column to template column with positive modulo
    const templateColIdx =
      ((col % model.numTemplateCols) + model.numTemplateCols) % model.numTemplateCols
    const columnData = model.columns[templateColIdx]
    const items = columnData?.items
    if (!items || items.length === 0) continue

    const worldX = col * model.colPitch
    const cycleH = columnData.cycleHeight

    // Calculate which cycle repetitions overlap the visible Y range
    const cycleMin = Math.floor(minWorldY / cycleH)
    const cycleMax = Math.floor(maxWorldY / cycleH)

    for (let cycle = cycleMin; cycle <= cycleMax; cycle++) {
      const baseY = cycle * cycleH
      const localMinY = minWorldY - baseY
      const startIdx = findFirstVisibleIndex(items, localMinY)

      for (let itemIdx = startIdx; itemIdx < items.length; itemIdx++) {
        const item = items[itemIdx]
        const worldY = baseY + item.offsetY

        // Since offsetY is strictly increasing, we can break immediately once past maxWorldY
        if (worldY > maxWorldY) break

        if (worldY + item.height >= minWorldY) {
          // Persistent key per artwork+column+cycle (without itemIdx) allows GPU transform interpolation when worldY shifts
          result.push({
            key: `${item.artwork.id}-c${col}-k${cycle}`,
            artwork: item.artwork,
            worldX,
            worldY,
            width: item.width,
            height: item.height,
          })
        }
      }
    }
  }

  return result
}

/**
 * Finds the exact world coordinates (worldX, worldY, width, height) of an artwork
 * inside the standard InfiniteGridModel, picking the column/cycle repetition closest
 * to a reference world coordinate (e.g. where the user clicked or last browsed).
 */
export function findArtworkWorldPosition(
  model: InfiniteGridModel | null,
  artworkId: string,
  refWorldX = 0,
  refWorldY = 0
): { worldX: number; worldY: number; width: number; height: number } | null {
  if (!model) return null

  for (let tCol = 0; tCol < model.numTemplateCols; tCol++) {
    const colData = model.columns[tCol]
    if (!colData) continue

    const item = colData.items.find((it) => it.artwork.id === artworkId)
    if (item) {
      // Find the world column repetition (tCol + k * numTemplateCols) closest to refWorldX
      const approxCol = refWorldX / model.colPitch
      const kCol = Math.round((approxCol - tCol) / model.numTemplateCols)
      const col = tCol + kCol * model.numTemplateCols
      const worldX = col * model.colPitch

      // Find the vertical cycle repetition closest to refWorldY
      const cycleH = colData.cycleHeight
      const approxCycle = (refWorldY - item.offsetY) / cycleH
      const cycle = Math.round(approxCycle)
      const worldY = cycle * cycleH + item.offsetY

      return {
        worldX,
        worldY,
        width: item.width,
        height: item.height,
      }
    }
  }

  return null
}

/**
 * Computes visible cards for Chromatic Radial Harmony mode while preserving each artwork's
 * true aspectRatio (portrait, square, landscape).
 * Centers the selected anchor artwork at (0, 0) with its natural proportions and stacks
 * radially-ranked color neighbors upward (row < 0) and downward (row > 0) per column.
 */
export function getHarmonizedVirtualCards(
  scoredArtworks: ScoredArtwork[],
  viewportX: number,
  viewportY: number,
  screenWidth: number,
  screenHeight: number,
  cardWidth = 260,
  _cardHeight = 320,
  gap = 12,
  buffer = 700
): VisibleVirtualCard[] {
  const len = scoredArtworks?.length || 0
  if (len === 0) return []

  const colPitch = cardWidth + gap

  const minWorldX = -viewportX - buffer
  const maxWorldX = screenWidth - viewportX + buffer
  const minWorldY = -viewportY - buffer
  const maxWorldY = screenHeight - viewportY + buffer

  const colMin = Math.floor(minWorldX / colPitch)
  const colMax = Math.ceil(maxWorldX / colPitch)

  const result: VisibleVirtualCard[] = []

  const getCardHeight = (art: Artwork): number => {
    const rawAspect = art.aspectRatio || 1.0
    const clampedAspect = Math.max(0.6, Math.min(1.8, rawAspect))
    return Math.round(cardWidth / clampedAspect)
  }

  // Max rows to traverse in either direction as safety bound
  const MAX_STEPS = 4000

  function getStableIdJitter(id: string): number {
    let hash = 0
    for (let i = 0; i < id.length; i++) {
      hash = (hash << 5) - hash + id.charCodeAt(i)
      hash |= 0
    }
    return (Math.abs(hash) % 61) - 30
  }

  for (let col = colMin; col <= colMax; col++) {
    const worldX = col * colPitch
    if (worldX + cardWidth < minWorldX || worldX > maxWorldX) continue

    // Subtle organic masonry vertical offset for non-anchor columns so rows don't look artificially rigid
    const colStagger = col === 0 ? 0 : ((Math.abs(col) % 3) - 1) * Math.round(gap * 2.5)

    // 1. Traverse downward from row = 0 (0, 1, 2, ...)
    let currentDownY = colStagger
    for (let row = 0; row < MAX_STEPS; row++) {
      const rank = getRadialRank(col, row)
      const scored = scoredArtworks[rank % len]
      const itemH = getCardHeight(scored.artwork)
      const worldY = currentDownY

      if (worldY > maxWorldY) break

      if (worldY + itemH >= minWorldY) {
        const isAnchor = col === 0 && row === 0
        const dist = Math.hypot(col, row)
        const jitter = isAnchor ? 0 : getStableIdJitter(scored.artwork.id)
        const waveDelayMs = isAnchor ? 0 : Math.max(0, Math.min(850, Math.round(dist * 48 + jitter)))

        result.push({
          key: `radial-${scored.artwork.id}-c${col}-r${row}`,
          artwork: scored.artwork,
          worldX,
          worldY,
          width: cardWidth,
          height: itemH,
          similarityPercent: scored.similarityPercent,
          isAnchor,
          waveDelayMs,
          radialDistance: dist,
        })
      }

      currentDownY += itemH + gap
    }

    // 2. Traverse upward from row = -1 (-1, -2, -3, ...)
    let currentUpBottomY = colStagger - gap
    for (let row = -1; row > -MAX_STEPS; row--) {
      const rank = getRadialRank(col, row)
      const scored = scoredArtworks[rank % len]
      const itemH = getCardHeight(scored.artwork)
      const worldY = currentUpBottomY - itemH

      if (worldY + itemH < minWorldY) break

      if (worldY <= maxWorldY) {
        const dist = Math.hypot(col, row)
        const jitter = getStableIdJitter(scored.artwork.id)
        const waveDelayMs = Math.max(0, Math.min(850, Math.round(dist * 48 + jitter)))

        result.push({
          key: `radial-${scored.artwork.id}-c${col}-r${row}`,
          artwork: scored.artwork,
          worldX,
          worldY,
          width: cardWidth,
          height: itemH,
          similarityPercent: scored.similarityPercent,
          isAnchor: false,
          waveDelayMs,
          radialDistance: dist,
        })
      }

      currentUpBottomY = worldY - gap
    }
  }

  return result
}

