import React, { forwardRef, memo, useEffect, useRef, useState } from 'react'
import { Sparkles, Eye, Palette, Layers, Pin } from 'lucide-react'
import type { Artwork } from '../../types/artwork'
import type { SimilaritySortMode } from '../../services/similarityService'
import { MotionVideoPreview } from '../MotionVideoPreview'
import { useI18n } from "../../i18n"

const PAGE_SIZE = 48

interface SimilarGridProps {
  items: Artwork[]
  isLoading: boolean
  hasVisualEmbeddings?: boolean
  mode: SimilaritySortMode
  onModeChange: (mode: SimilaritySortMode) => void
  scrollRootRef: React.RefObject<HTMLDivElement | null>
  onSelect: (item: Artwork) => void
  activeArtworkId?: string
  compareArtworkId?: string | null
  onCompareSelect?: (item: Artwork) => void
}

const MODE_OPTIONS: {
  id: SimilaritySortMode
  label: string
  hint: string
  icon: typeof Layers
}[] = [
  {
    id: 'hybrid',
    label: 'Hybrid',
    hint: 'Visual aesthetics + Palette harmony + Tags',
    icon: Layers,
  },
  {
    id: 'visual',
    label: 'AI Aesthetics',
    hint: 'Art direction, style & composition (CLIP)',
    icon: Eye,
  },
  {
    id: 'color',
    label: 'Palette',
    hint: 'Chromatic harmony of 5 weighted colors',
    icon: Palette,
  },
]

/**
 * "Similares" masonry section with incremental (infinite-scroll) rendering,
 * aesthetic/visual/color mode switching, and side-by-side comparison pinning (Shift + Click).
 */
export const SimilarGrid = memo(
  forwardRef<HTMLElement, SimilarGridProps>(function SimilarGrid(
    {
      items,
      isLoading,
      mode,
      onModeChange,
      scrollRootRef,
      onSelect,
      activeArtworkId,
      compareArtworkId,
      onCompareSelect,
    },
    ref
  ) {
    const { t } = useI18n()
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
    const sentinelRef = useRef<HTMLDivElement | null>(null)

    // Reset pagination during render when a new result list arrives
    const [prevItems, setPrevItems] = useState(items)
    if (items !== prevItems) {
      setPrevItems(items)
      setVisibleCount(PAGE_SIZE)
    }

    useEffect(() => {
      const sentinel = sentinelRef.current
      const root = scrollRootRef.current
      if (!sentinel || !root) return
      const observer = new IntersectionObserver(
        entries => {
          if (entries[0].isIntersecting) {
            setVisibleCount(prev => Math.min(items.length, prev + PAGE_SIZE))
          }
        },
        { root, rootMargin: '400px' }
      )
      observer.observe(sentinel)
      return () => observer.disconnect()
    }, [items.length, scrollRootRef, visibleCount])

    const visibleItems = items.slice(0, visibleCount)

    return (
      <section
        ref={ref}
        className="w-full px-6 md:px-12 pt-16 pb-24 max-w-7xl mx-auto border-t border-zinc-800/60"
      >
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Sparkles className="w-4 h-4 text-zinc-200" />
            <h3 className="text-sm font-semibold tracking-wider uppercase text-zinc-200">{t("viewer.similar")}</h3>
            {items.length > 0 && (
              <span className="text-xs text-zinc-500 font-mono">{t("viewer.similarReferences", { count: items.length })}</span>
            )}
            <span className="hidden md:inline text-[11px] text-zinc-500 font-mono">
              {t("viewer.shiftClickCompare")}
            </span>
          </div>

          {/* Mode Selector: Misto | Estética IA | Paleta */}
          <div className="flex items-center gap-1 p-1 rounded-full bg-zinc-900/90 border border-zinc-800/90 self-start sm:self-auto">
            {MODE_OPTIONS.map(opt => {
              const Icon = opt.icon
              const isActive = mode === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onModeChange(opt.id)}
                  title={opt.hint}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-zinc-100 text-zinc-950 shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{opt.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Grid or Empty/Loading State */}
        {isLoading && items.length === 0 ? (
          <div className="columns-2 sm:columns-3 md:columns-4 xl:columns-5 gap-4">
            {Array.from({ length: 15 }).map((_, idx) => (
              <div
                key={`skeleton-sim-${idx}`}
                className="rounded-xl overflow-hidden skeleton-shimmer break-inside-avoid mb-4"
                style={{ height: `${200 + (idx % 4) * 40}px` }}
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 text-xs">
            {t("viewer.noSimilarFound")}
          </div>
        ) : (
          <>
            <div className="columns-2 sm:columns-3 md:columns-4 xl:columns-5 gap-4">
              {visibleItems.map(item => {
                const isA = item.id === activeArtworkId
                const isB = item.id === compareArtworkId

                return (
                  <div
                    key={item.id}
                    onClick={e => {
                      if (e.shiftKey && onCompareSelect) {
                        e.preventDefault()
                        onCompareSelect(item)
                      } else if (compareArtworkId && onCompareSelect) {
                        onCompareSelect(item)
                      } else {
                        onSelect(item)
                      }
                    }}
                    className={`group relative rounded-xl overflow-hidden bg-zinc-900/70 border transition-all cursor-pointer shadow-md hover:shadow-xl break-inside-avoid mb-4 ${
                      isA
                        ? 'border-white ring-2 ring-white/30'
                        : isB
                        ? 'border-amber-500/80 ring-2 ring-amber-500/40'
                        : 'border-zinc-800/80 hover:border-zinc-500'
                    }`}
                    style={{ aspectRatio: item.aspectRatio ? `${item.aspectRatio}` : '1 / 1.2' }}
                  >
                    <div className="relative w-full h-full overflow-hidden skeleton-shimmer">
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                      />

                      {/* Native Video Preview on Hover with Motion Scrubbing */}
                      <MotionVideoPreview
                        artwork={item}
                        badgePosition="bottom-left"
                      />
                    </div>

                    {/* Active Reference Badges */}
                    {isA && (
                      <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-zinc-800 text-white border border-zinc-600 text-[10px] font-mono font-medium shadow-md">
                        Ref A
                      </div>
                    )}
                    {isB && (
                      <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-amber-500/90 text-zinc-950 text-[10px] font-mono font-bold shadow-md">
                        Ref B
                      </div>
                    )}

                    {/* Hover Pin to Compare Button */}
                    {onCompareSelect && (
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          onCompareSelect(item)
                        }}
                        title={t("viewer.shiftClickCompare")}
                        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 p-1.5 rounded-full bg-zinc-950/85 hover:bg-white text-zinc-300 hover:text-zinc-950 border border-zinc-700/80 backdrop-blur-md transition-all cursor-pointer shadow-lg hover:scale-105"
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Infinite Scroll Sentinel */}
            {visibleCount < items.length && (
              <div
                ref={sentinelRef}
                className="w-full py-10 flex items-center justify-center text-xs text-zinc-500"
              >
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse" />
                  <span>{t("viewer.loadingSimilar")}</span>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    )
  })
)


