import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Info, Sparkles } from 'lucide-react'
import type { Artwork } from '../types/artwork'
import { MotionVideoPreview } from './MotionVideoPreview'
import { OmnimageLogo } from './OmnimageLogo'

export interface ExploreFeedViewProps {
  artworks: Artwork[]
  gridSize: 'small' | 'default' | 'large'
  selectedColors?: string[]
  onToggleColor?: (hex: string) => void
  onSearchTag?: (tag: string) => void
  onSelectArtwork?: (artwork: Artwork) => void
  onVisibleCountChange?: (count: number) => void
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>
  isLoading?: boolean
}

interface VirtualMasonryItem {
  artwork: Artwork
  top: number
  left: number
  width: number
  height: number
}

const GAP = 16
const OVERSCAN_PX = 600
const SCROLL_QUANTIZE_STEP = 120

function computeNumCols(width: number, _gridSize: 'small' | 'default' | 'large'): number {
  const isMobile = width < 640
  const isTablet = width >= 640 && width < 1024

  if (isMobile) return 2
  if (isTablet) return 3
  return 5
}

export const ExploreFeedView: React.FC<ExploreFeedViewProps> = React.memo(({
  artworks,
  gridSize,
  onSelectArtwork,
  onVisibleCountChange,
  scrollContainerRef,
  isLoading = false,
}) => {
  const internalScrollRef = useRef<HTMLDivElement | null>(null)
  const containerRef = scrollContainerRef || internalScrollRef

  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1440
  )
  const [viewportHeight, setViewportHeight] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerHeight : 900
  )
  const [scrollTop, setScrollTop] = useState<number>(0)
  const [isScrolling, setIsScrolling] = useState<boolean>(false)
  const scrollEndTimerRef = useRef<number | null>(null)
  const lastCommittedScrollTopRef = useRef<number>(0)
  const scrollRafRef = useRef<number | null>(null)

  const handleSelectItem = useCallback(
    (item: Artwork) => {
      onSelectArtwork?.(item)
    },
    [onSelectArtwork]
  )

  // Track window resize via rAF throttle for responsive column calculation
  useEffect(() => {
    let resizeRaf: number | null = null
    const handleResize = () => {
      if (resizeRaf !== null) return
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null
        setViewportWidth(window.innerWidth)
        setViewportHeight(window.innerHeight)
      })
    }
    window.addEventListener('resize', handleResize, { passive: true })
    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeRaf !== null) cancelAnimationFrame(resizeRaf)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current)
      }
      if (scrollEndTimerRef.current !== null) {
        window.clearTimeout(scrollEndTimerRef.current)
      }
    }
  }, [])

  // Handle scroll events via rAF + quantized threshold (120px) to eliminate redundant re-renders
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    const currentScrollTop = target.scrollTop
    const currentClientHeight = target.clientHeight

    setIsScrolling(true)
    if (scrollEndTimerRef.current !== null) {
      window.clearTimeout(scrollEndTimerRef.current)
    }
    scrollEndTimerRef.current = window.setTimeout(() => {
      setIsScrolling(false)
      scrollEndTimerRef.current = null
    }, 150)

    if (scrollRafRef.current !== null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      if (
        currentScrollTop === 0 ||
        Math.abs(currentScrollTop - lastCommittedScrollTopRef.current) >= SCROLL_QUANTIZE_STEP
      ) {
        lastCommittedScrollTopRef.current = currentScrollTop
        setScrollTop(currentScrollTop)
      }
      if (currentClientHeight > 0 && currentClientHeight !== viewportHeight) {
        setViewportHeight(currentClientHeight)
      }
    })
  }, [viewportHeight])

  const numCols = useMemo(
    () => computeNumCols(viewportWidth, gridSize),
    [viewportWidth, gridSize]
  )

  // Compute virtualized masonry columns where every card has identical width and exact proportional height (no crop)
  const { columns, totalHeight } = useMemo(() => {
    const horizontalPadding = 48 // px-6 = 24px each side
    const availableWidth = Math.max(320, viewportWidth - horizontalPadding)
    const colWidth = Math.floor((availableWidth - GAP * (numCols - 1)) / numCols)

    const colItems: VirtualMasonryItem[][] = Array.from({ length: numCols }, () => [])
    const colHeights: number[] = Array.from({ length: numCols }, () => 0)

    for (let i = 0; i < artworks.length; i++) {
      const item = artworks[i]
      // Find shortest column to keep masonry balanced
      let shortestCol = 0
      for (let c = 1; c < numCols; c++) {
        if (colHeights[c] < colHeights[shortestCol]) {
          shortestCol = c
        }
      }

      const rawAspect = item.aspectRatio && item.aspectRatio > 0 ? item.aspectRatio : 1.0
      const itemHeight = Math.max(40, Math.round(colWidth / rawAspect))
      const top = colHeights[shortestCol]
      const left = shortestCol * (colWidth + GAP)

      colItems[shortestCol].push({
        artwork: item,
        top,
        left,
        width: colWidth,
        height: itemHeight,
      })

      colHeights[shortestCol] = top + itemHeight + GAP
    }

    const maxColHeight = colHeights.length > 0 ? Math.max(...colHeights) : 0

    return {
      columns: colItems,
      totalHeight: Math.max(0, maxColHeight - GAP),
    }
  }, [artworks, numCols, viewportWidth])

  // Filter visible items across all columns within [scrollTop - 600, scrollTop + clientHeight + 600]
  const visibleItems = useMemo(() => {
    const minY = scrollTop - OVERSCAN_PX
    const maxY = scrollTop + viewportHeight + OVERSCAN_PX
    const result: VirtualMasonryItem[] = []

    for (let c = 0; c < columns.length; c++) {
      const col = columns[c]
      if (col.length === 0) continue

      // Binary search for first visible item in column c
      let low = 0
      let high = col.length - 1
      let startIdx = col.length

      while (low <= high) {
        const mid = (low + high) >>> 1
        const entry = col[mid]
        if (entry.top + entry.height < minY) {
          low = mid + 1
        } else {
          startIdx = mid
          high = mid - 1
        }
      }

      for (let i = startIdx; i < col.length; i++) {
        const entry = col[i]
        if (entry.top > maxY) break
        result.push(entry)
      }
    }

    return result
  }, [columns, scrollTop, viewportHeight])

  // Notify parent when visible item count changes
  const visibleItemsCount = visibleItems.length

  useEffect(() => {
    onVisibleCountChange?.(visibleItemsCount)
  }, [visibleItemsCount, onVisibleCountChange])

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      onScroll={handleScroll}
      className="h-screen w-screen overflow-y-auto overflow-x-hidden bg-[#09090b] pt-24 pb-28 px-6 select-none"
    >
      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-3">
          <OmnimageLogo size={36} interactive={false} className="mb-1" />
          <p className="text-sm font-medium text-zinc-300">Carregando acervo...</p>
        </div>
      ) : artworks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
            <Sparkles className="w-5 h-5" />
          </div>
          <p className="text-sm font-medium text-zinc-300">
            Nenhuma referência encontrada para os filtros atuais
          </p>
          <p className="text-xs text-zinc-500 max-w-sm">
            Experimente limpar o filtro de cores ou ajustar os termos da busca para explorar todo o acervo.
          </p>
        </div>
      ) : (
        <div
          className="relative w-full mx-auto"
          style={{ height: `${totalHeight}px` }}
        >
          {visibleItems.map(({ artwork: item, top, left, width, height }) => (
            <article
              key={item.id}
              onClick={() => handleSelectItem(item)}
              style={{
                transform: `translate3d(${left}px, ${top}px, 0)`,
                width: `${width}px`,
                height: `${height}px`,
              }}
              className="group absolute top-0 left-0 flex flex-col rounded-xl overflow-hidden bg-zinc-900/70 border border-zinc-800/80 hover:border-zinc-600/90 transition-colors cursor-pointer shadow-md hover:shadow-xl"
            >
              {/* Thumbnail Container */}
              <div className="relative w-full h-full overflow-hidden skeleton-shimmer">
                <img
                  src={item.thumbnailUrl}
                  alt={item.title}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="w-full h-full object-contain"
                />

                {/* Native Video Preview on Hover with Motion Scrubbing */}
                <MotionVideoPreview
                  artwork={item}
                  isHoverDisabled={isScrolling}
                  badgePosition="bottom-left"
                />

                {/* Hover Overlay with Info Icon */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-start justify-end p-2.5 pointer-events-none">
                  <span
                    role="button"
                    title="Ver detalhes"
                    aria-label="Ver detalhes"
                    className="pointer-events-auto p-2 rounded-full bg-zinc-950/80 text-zinc-100 border border-white/15 backdrop-blur-md shadow-lg transform translate-y-1 group-hover:translate-y-0 transition-transform duration-200"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
})

