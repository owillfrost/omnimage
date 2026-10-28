import * as React from "react"
import type { Artwork } from "../types/artwork"
import type { SimilaritySortMode } from "../services/similarityService"
import { MotionVideoPreview } from "./MotionVideoPreview"
import { cn } from "@/lib/utils"
import { Sparkles, Copy, Check, Maximize2 } from "lucide-react"

interface ArtworkCardProps {
  artwork: Artwork
  onSelect: (artwork: Artwork, worldX?: number, worldY?: number) => void
  onPrefetchSort?: (artwork: Artwork) => void
  onOpenFullscreen?: (artwork: Artwork) => void
  overrideWorldX?: number
  overrideWorldY?: number
  overrideWidth?: number
  overrideHeight?: number
  isAnchor?: boolean
  similarityPercent?: number
  isHarmonizedMode?: boolean
  anchorMode?: SimilaritySortMode
  isWaveActive?: boolean
  waveDelayMs?: number
  anchorEpoch?: number
  isCanvasDragging?: boolean
}

const LOADED_IMAGE_CACHE = new Set<string>()

const ArtworkCardComponent: React.FC<ArtworkCardProps> = ({
  artwork,
  onSelect,
  onPrefetchSort,
  onOpenFullscreen,
  overrideWorldX,
  overrideWorldY,
  overrideWidth,
  overrideHeight,
  isAnchor = false,
  similarityPercent,
  isHarmonizedMode = false,
  anchorMode = 'hybrid',
  isWaveActive = false,
  waveDelayMs = 0,
  anchorEpoch = 0,
  isCanvasDragging = false,
}) => {
  const [isLoaded, setIsLoaded] = React.useState(() =>
    LOADED_IMAGE_CACHE.has(artwork.thumbnailUrl)
  )
  const [isCopied, setIsCopied] = React.useState(false)
  const copyTimeoutRef = React.useRef<number | null>(null)
  const pointerDownPosRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const hasPointerDownRef = React.useRef(false)

  // Track initial mount epoch so only cards already mounted in this epoch participate in the wave
  const mountEpochRef = React.useRef(anchorEpoch)
  const isOriginalEpochMount = mountEpochRef.current === anchorEpoch
  const shouldAnimateWave = isHarmonizedMode && isWaveActive && !isAnchor && isOriginalEpochMount

  // Track will-change lifecycle: active only during the ripple wave animation, removed after
  const [isWaveAnimating, setIsWaveAnimating] = React.useState(shouldAnimateWave)

  React.useEffect(() => {
    if (!shouldAnimateWave) {
      setIsWaveAnimating(false)
      return
    }

    setIsWaveAnimating(true)
    const totalDuration = waveDelayMs + 950
    const timer = window.setTimeout(() => {
      setIsWaveAnimating(false)
    }, totalDuration)

    return () => {
      window.clearTimeout(timer)
    }
  }, [shouldAnimateWave, waveDelayMs, anchorEpoch])

  const hasPrompt = Boolean(
    artwork.culture &&
      artwork.culture !== 'Local Asset' &&
      artwork.culture.trim().length > 0
  )

  React.useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const posX = overrideWorldX !== undefined ? overrideWorldX : artwork.worldX
  const posY = overrideWorldY !== undefined ? overrideWorldY : artwork.worldY
  const cardW = overrideWidth !== undefined ? overrideWidth : artwork.width
  const cardH = overrideHeight !== undefined ? overrideHeight : artwork.height

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    hasPointerDownRef.current = true
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY }
    onPrefetchSort?.(artwork)
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (hasPointerDownRef.current) {
      const distance = Math.hypot(
        e.clientX - pointerDownPosRef.current.x,
        e.clientY - pointerDownPosRef.current.y
      )
      if (distance > 8) {
        return
      }
    }
    hasPointerDownRef.current = false
    onSelect(artwork, posX, posY)
  }

  const handleCopyPrompt = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!artwork.culture) return
    navigator.clipboard.writeText(artwork.culture)
    setIsCopied(true)
    if (copyTimeoutRef.current !== null) {
      window.clearTimeout(copyTimeoutRef.current)
    }
    copyTimeoutRef.current = window.setTimeout(() => {
      setIsCopied(false)
      copyTimeoutRef.current = null
    }, 1500)
  }

  const handleOpenFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation()
    onOpenFullscreen?.(artwork)
  }

  return (
    <div
      data-card="true"
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      className={cn(
        "group absolute cursor-pointer select-none rounded-xl overflow-hidden border bg-zinc-900/60 shadow-md",
        shouldAnimateWave
          ? "anchor-wave-card"
          : "animate-in fade-in duration-200 transition-[transform,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        isWaveAnimating && "is-wave-animating",
        isAnchor
          ? "border-white ring-2 ring-white/90 shadow-[0_0_35px_rgba(255,255,255,0.35)] z-20"
          : "border-zinc-800/80 hover:border-zinc-500"
      )}
      style={{
        transform: `translate3d(${posX}px, ${posY}px, 0)`,
        width: `${cardW}px`,
        height: `${cardH}px`,
        backgroundColor: artwork.dominantColor ? `${artwork.dominantColor}15` : '#18181b',
        contain: 'layout paint',
        '--d': `${waveDelayMs}ms`,
      } as React.CSSProperties}
    >
      {/* Anchor Wave Shimmer Placeholder (GPU-accelerated Phase 1) */}
      {shouldAnimateWave && !isLoaded && (
        <div className="anchor-wave-placeholder" />
      )}

      {/* Standard skeleton shimmer placeholder when not in wave mode */}
      {!shouldAnimateWave && !LOADED_IMAGE_CACHE.has(artwork.thumbnailUrl) && (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-200 ease-out pointer-events-none skeleton-shimmer",
            isLoaded ? "opacity-0" : "opacity-100"
          )}
        />
      )}

      {/* Main image: async off-thread decoding, native drag disabled */}
      <img
        src={artwork.thumbnailUrl}
        alt={artwork.title}
        decoding="async"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onLoad={() => {
          LOADED_IMAGE_CACHE.add(artwork.thumbnailUrl)
          setIsLoaded(true)
        }}
        className={cn(
          "w-full h-full object-cover pointer-events-none select-none",
          shouldAnimateWave
            ? cn("anchor-wave-image-reveal", isLoaded ? "opacity-100" : "opacity-0")
            : LOADED_IMAGE_CACHE.has(artwork.thumbnailUrl)
            ? "opacity-100"
            : isLoaded
            ? "opacity-100 transition-opacity duration-200 ease-out"
            : "opacity-0"
        )}
      />

      {/* Native Video Preview on Stationary Hover (350ms) with Motion Scrubbing */}
      <MotionVideoPreview
        artwork={artwork}
        isHoverDisabled={isCanvasDragging || hasPointerDownRef.current}
        badgePosition="bottom-left"
      />

      {/* Anchor Badge */}
      {isAnchor && (
        <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white text-black font-semibold text-[10px] tracking-wide shadow-lg pointer-events-none">
          <Sparkles className="w-3 h-3 text-amber-500 fill-amber-500" />
          <span>
            {artwork.isTextQuery
              ? 'Busca IA • Epicentro'
              : anchorMode === 'visual'
              ? 'Âncora • Estética IA'
              : anchorMode === 'color'
              ? 'Âncora • Paleta'
              : anchorMode === 'grade'
              ? 'Âncora • Grade'
              : 'Âncora • Misto'}
          </span>
        </div>
      )}

      {/* Proximity / Hue Match Badge for surrounding cards */}
      {isHarmonizedMode && !isAnchor && similarityPercent !== undefined && (
        <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/85 border border-white/10 text-white/90 text-[10px] font-mono shadow-md pointer-events-none">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: artwork.dominantColor || '#ffffff' }}
          />
          <span>
            {similarityPercent}% {anchorMode === 'color' ? 'tom' : anchorMode === 'visual' ? 'IA' : 'afinidade'}
          </span>
        </div>
      )}

      {/* Top-Right Quick Actions: Copy Prompt & Open Fullscreen Inspector (stops propagation) */}
      <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
        {hasPrompt && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleCopyPrompt}
            title="Copiar prompt / anotação"
            className={cn(
              "flex items-center gap-1 px-2 py-1.5 rounded-full bg-black/85 hover:bg-black/95 border border-white/15 text-white text-[10px] font-medium shadow-md transition-opacity duration-150 cursor-pointer",
              isCopied
                ? "opacity-100 border-emerald-500/40 text-emerald-300"
                : "opacity-0 group-hover:opacity-100"
            )}
          >
            {isCopied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>Copiado</span>
              </>
            ) : (
              <Copy className="w-3 h-3 text-zinc-200 shrink-0" />
            )}
          </button>
        )}

        {onOpenFullscreen && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleOpenFullscreen}
            title="Ver em tela cheia (Inspector Eagle)"
            aria-label="Ver em tela cheia"
            className={cn(
              "p-1.5 rounded-full bg-black/85 hover:bg-black/95 border border-white/15 text-zinc-200 hover:text-white shadow-md transition-opacity duration-150 cursor-pointer",
              isAnchor ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

// React.memo with shallow prop equality prevents re-rendering all cards when panning
export const ArtworkCard = React.memo(ArtworkCardComponent, (prev, next) => {
  return (
    prev.artwork.id === next.artwork.id &&
    prev.artwork.culture === next.artwork.culture &&
    prev.overrideWorldX === next.overrideWorldX &&
    prev.overrideWorldY === next.overrideWorldY &&
    prev.overrideWidth === next.overrideWidth &&
    prev.overrideHeight === next.overrideHeight &&
    prev.isAnchor === next.isAnchor &&
    prev.similarityPercent === next.similarityPercent &&
    prev.isHarmonizedMode === next.isHarmonizedMode &&
    prev.anchorMode === next.anchorMode &&
    prev.isWaveActive === next.isWaveActive &&
    prev.waveDelayMs === next.waveDelayMs &&
    prev.anchorEpoch === next.anchorEpoch &&
    prev.isCanvasDragging === next.isCanvasDragging &&
    prev.onSelect === next.onSelect &&
    prev.onPrefetchSort === next.onPrefetchSort &&
    prev.onOpenFullscreen === next.onOpenFullscreen
  )
})


