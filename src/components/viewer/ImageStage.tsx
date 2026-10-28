import React, { memo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  Pin,
  PinOff,
  ArrowLeftRight,
  Link2,
  Unlink,
  X,
  FileImage,
} from 'lucide-react'
import type { Artwork } from '../../types/artwork'
import { useI18n } from "../../i18n"

const ZOOM_LEVELS = [1, 1.5, 2.5]

function parseArtworkId(id: string) {
  if (id.startsWith('google-flow-')) {
    return { lib: 'google-flow', rawId: id.slice('google-flow-'.length) }
  }
  if (id.startsWith('design-')) {
    return { lib: 'design', rawId: id.slice('design-'.length) }
  }
  const dashIdx = id.indexOf('-')
  if (dashIdx > 0) {
    return { lib: id.slice(0, dashIdx), rawId: id.slice(dashIdx + 1) }
  }
  return { lib: 'design', rawId: id }
}

export interface ImageStageProps {
  artwork: Artwork
  compareArtwork?: Artwork | null
  isPinned?: boolean
  isSyncZoomPan?: boolean
  showNav: boolean
  onPrev: () => void
  onNext: () => void
  onFullLoaded: () => void
  onScrollToSimilar: () => void
  onTogglePin?: () => void
  onClearCompare?: () => void
  onSwapCompare?: () => void
  onToggleSyncZoomPan?: () => void
}

/**
 * Hero image stage supporting single view and Split View (A | B)
 * with synchronized or independent zoom & drag-pan.
 */
export const ImageStage = memo(function ImageStage({
  artwork,
  compareArtwork,
  isPinned = false,
  isSyncZoomPan = true,
  showNav,
  onPrev,
  onNext,
  onFullLoaded,
  onScrollToSimilar,
  onTogglePin,
  onClearCompare,
  onSwapCompare,
  onToggleSyncZoomPan,
}: ImageStageProps) {
  const { t } = useI18n()
  // Shared / Primary zoom and pan
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [fullLoadedA, setFullLoadedA] = useState(false)
  const [fullLoadedB, setFullLoadedB] = useState(false)

  // Independent pan for pane B if sync is toggled off
  const [panB, setPanB] = useState({ x: 0, y: 0 })
  const [activePane, setActivePane] = useState<'A' | 'B'>('A')

  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  // Reset secondary load state during render when compareArtwork changes (avoids cascading effect render)
  const [prevCompareId, setPrevCompareId] = useState<string | undefined>(compareArtwork?.id)
  if (compareArtwork?.id !== prevCompareId) {
    setPrevCompareId(compareArtwork?.id)
    setFullLoadedB(false)
  }

  const isComparing = !!compareArtwork
  const isVideoA = /^(MP4|WEBM|MOV)/.test(artwork.medium)
  const isVideoB = compareArtwork ? /^(MP4|WEBM|MOV)/.test(compareArtwork.medium) : false

  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom)
    if (newZoom <= 1) {
      setPan({ x: 0, y: 0 })
      setPanB({ x: 0, y: 0 })
    }
  }

  const handleMouseDown = (e: React.MouseEvent, pane: 'A' | 'B' = 'A') => {
    if (zoom <= 1) return
    e.preventDefault()
    setIsDragging(true)
    setActivePane(pane)
    const currentPan = !isSyncZoomPan && pane === 'B' ? panB : pan
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: currentPan.x,
      panY: currentPan.y,
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoom <= 1) return
    const start = dragStartRef.current
    const newX = start.panX + e.clientX - start.x
    const newY = start.panY + e.clientY - start.y

    if (isSyncZoomPan || activePane === 'A') {
      setPan({ x: newX, y: newY })
    }
    if (!isSyncZoomPan && activePane === 'B') {
      setPanB({ x: newX, y: newY })
    }
  }

  const handleMouseUp = () => setIsDragging(false)

  const handleFullLoadA = () => {
    setFullLoadedA(true)
    onFullLoaded()
  }

  const handleFullLoadB = () => {
    setFullLoadedB(true)
  }

  const mediaClassSingle =
    'max-h-[82vh] max-w-[82vw] lg:max-w-[calc(100vw-480px)] rounded-lg shadow-2xl object-contain select-none'
  const mediaClassSplit =
    'max-h-[72vh] max-w-[95%] rounded-lg shadow-2xl object-contain select-none pointer-events-none'
  const navBtnClass =
    'absolute z-20 p-3 rounded-full bg-zinc-900/80 hover:bg-zinc-800/95 text-zinc-300 hover:text-white border border-zinc-800/80 backdrop-blur-md transition-all cursor-pointer shadow-xl hover:scale-105'

  return (
    <div
      className="relative w-full min-h-[calc(100vh-80px)] flex flex-col items-center justify-center p-4 md:p-8 -mt-20 pt-20"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
    >
      {/* Previous / Next Navigation Buttons (Only shown when not in split mode) */}
      {showNav && !isComparing && (
        <>
          <button
            onClick={e => {
              e.stopPropagation()
              onPrev()
            }}
            title={t("viewer.prev")}
            className={`${navBtnClass} left-4 md:left-6`}
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={e => {
              e.stopPropagation()
              onNext()
            }}
            title={t("viewer.next")}
            className={`${navBtnClass} right-4 md:right-6`}
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        </>
      )}

      {/* Floating Pending Pin Toast Hint */}
      {isPinned && !isComparing && (
        <div className="absolute top-22 z-20 flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/15 border border-amber-500/40 backdrop-blur-xl text-xs text-amber-200 shadow-xl animate-in fade-in slide-in-from-top-2">
          <Pin className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span>{t("viewer.refAPinned")}</span>
          <button
            onClick={onTogglePin}
            className="ml-1 text-zinc-400 hover:text-white cursor-pointer"
            title={t("viewer.cancelPin")}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Single View Mode ──────────────────────────────────────────────── */}
      {!isComparing ? (
        <div
          className="relative flex items-center justify-center max-w-full max-h-full transition-transform duration-150 ease-out"
          onMouseDown={e => handleMouseDown(e, 'A')}
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            transitionProperty: isDragging ? 'none' : 'transform',
          }}
        >
          {isVideoA ? (
            <video
              src={artwork.imageUrl}
              poster={artwork.thumbnailUrl}
              controls
              autoPlay
              loop
              className={`${mediaClassSingle} border border-zinc-800/60 bg-zinc-900`}
            />
          ) : (
            <div className="relative flex items-center justify-center">
              {/* Instant Thumbnail Layer */}
              <img
                src={artwork.thumbnailUrl}
                alt={artwork.title}
                draggable={false}
                className={`${mediaClassSingle} transition-opacity duration-300 ${
                  fullLoadedA ? 'opacity-0 absolute inset-0 pointer-events-none' : 'opacity-100'
                }`}
              />
              {/* High Resolution Layer */}
              <img
                src={artwork.imageUrl}
                alt={artwork.title}
                draggable={zoom === 1 && typeof (window as any).omnimageDesktop !== 'undefined'}
                onDragStart={(e) => {
                  if (typeof (window as any).omnimageDesktop?.startDrag === 'function') {
                    e.preventDefault()
                    const { lib, rawId } = parseArtworkId(artwork.id)
                    ;(window as any).omnimageDesktop.startDrag(lib, rawId)
                  }
                }}
                onLoad={handleFullLoadA}
                className={`${mediaClassSingle} border border-zinc-800/60 transition-opacity duration-300 ${
                  fullLoadedA ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </div>
          )}
        </div>
      ) : (
        /* ── Split View Mode (A | B) ───────────────────────────────────────── */
        <div className="w-full max-w-7xl h-[calc(100vh-140px)] flex flex-col">
          {/* Top Split Indicators */}
          <div className="flex items-center justify-between px-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-[11px] font-mono font-medium">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: artwork.dominantColor }} />
                <span>{t("viewer.refABase")}</span>
              </span>
              <span className="text-xs text-zinc-400 truncate max-w-[200px] hidden sm:inline">
                {artwork.title}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-zinc-500">VS</span>
              {onSwapCompare && (
                <button
                  onClick={onSwapCompare}
                  title={t("viewer.swapAria")}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs transition-all cursor-pointer"
                >
                  <ArrowLeftRight className="w-3 h-3 text-white" />
                  <span className="hidden md:inline">{t("viewer.swap")}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 truncate max-w-[200px] hidden sm:inline">
                {compareArtwork.title}
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-mono font-medium">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: compareArtwork.dominantColor }}
                />
                <span>{t("viewer.refBCompare")}</span>
              </span>
              {onClearCompare && (
                <button
                  onClick={onClearCompare}
                  title={t("viewer.exitCompare")}
                  className="p-1 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Dual Stage Panes */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 min-h-0">
            {/* Left Pane: Artwork A */}
            <div
              className="relative flex items-center justify-center overflow-hidden rounded-xl bg-zinc-950/60 border border-zinc-800/80 p-2"
              onMouseDown={e => handleMouseDown(e, 'A')}
            >
              <div
                className="relative flex items-center justify-center max-w-full max-h-full transition-transform duration-150 ease-out"
                style={{
                  transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                  transitionProperty: isDragging && (isSyncZoomPan || activePane === 'A') ? 'none' : 'transform',
                }}
              >
                {isVideoA ? (
                  <video
                    src={artwork.imageUrl}
                    poster={artwork.thumbnailUrl}
                    controls
                    autoPlay
                    loop
                    className={mediaClassSplit}
                  />
                ) : (
                  <div className="relative flex items-center justify-center">
                    <img
                      src={artwork.thumbnailUrl}
                      alt={artwork.title}
                      draggable={false}
                      className={`${mediaClassSplit} transition-opacity duration-300 ${
                        fullLoadedA ? 'opacity-0 absolute inset-0' : 'opacity-100'
                      }`}
                    />
                    <img
                      src={artwork.imageUrl}
                      alt={artwork.title}
                      draggable={false}
                      onLoad={handleFullLoadA}
                      className={`${mediaClassSplit} transition-opacity duration-300 ${
                        fullLoadedA ? 'opacity-100' : 'opacity-0'
                      }`}
                    />
                  </div>
                )}
              </div>

              {/* Sub-label for Pane A */}
              <div className="absolute bottom-3 left-3 pointer-events-none flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-950/80 backdrop-blur-md border border-zinc-800 text-[10px] text-zinc-400 font-mono">
                <FileImage className="w-3 h-3 text-zinc-500" />
                <span>{artwork.aspectRatio ? `${artwork.aspectRatio.toFixed(2)}:1` : 'Original'}</span>
              </div>
            </div>

            {/* Right Pane: Artwork B */}
            <div
              className="relative flex items-center justify-center overflow-hidden rounded-xl bg-zinc-950/60 border border-zinc-800/80 p-2"
              onMouseDown={e => handleMouseDown(e, 'B')}
            >
              <div
                className="relative flex items-center justify-center max-w-full max-h-full transition-transform duration-150 ease-out"
                style={{
                  transform: `translate3d(${
                    isSyncZoomPan ? pan.x : panB.x
                  }px, ${isSyncZoomPan ? pan.y : panB.y}px, 0) scale(${zoom})`,
                  transitionProperty: isDragging && (isSyncZoomPan || activePane === 'B') ? 'none' : 'transform',
                }}
              >
                {isVideoB ? (
                  <video
                    src={compareArtwork.imageUrl}
                    poster={compareArtwork.thumbnailUrl}
                    controls
                    autoPlay
                    loop
                    className={mediaClassSplit}
                  />
                ) : (
                  <div className="relative flex items-center justify-center">
                    <img
                      src={compareArtwork.thumbnailUrl}
                      alt={compareArtwork.title}
                      draggable={false}
                      className={`${mediaClassSplit} transition-opacity duration-300 ${
                        fullLoadedB ? 'opacity-0 absolute inset-0' : 'opacity-100'
                      }`}
                    />
                    <img
                      src={compareArtwork.imageUrl}
                      alt={compareArtwork.title}
                      draggable={false}
                      onLoad={handleFullLoadB}
                      className={`${mediaClassSplit} transition-opacity duration-300 ${
                        fullLoadedB ? 'opacity-100' : 'opacity-0'
                      }`}
                    />
                  </div>
                )}
              </div>

              {/* Sub-label for Pane B */}
              <div className="absolute bottom-3 left-3 pointer-events-none flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-950/80 backdrop-blur-md border border-zinc-800 text-[10px] text-zinc-400 font-mono">
                <FileImage className="w-3 h-3 text-zinc-500" />
                <span>
                  {compareArtwork.aspectRatio
                    ? `${compareArtwork.aspectRatio.toFixed(2)}:1`
                    : 'Original'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Floating Control Bar */}
      <div
        className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 p-1.5 rounded-full bg-zinc-900/90 border border-zinc-800/80 backdrop-blur-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Zoom Level Selectors */}
        {ZOOM_LEVELS.map(level => (
          <button
            key={level}
            onClick={() => handleZoomChange(level)}
            className={`px-3 py-1 rounded-full text-xs font-mono font-medium transition-all cursor-pointer ${
              zoom === level
                ? 'bg-zinc-100 text-zinc-950 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            {level}x
          </button>
        ))}

        <div className="w-px h-4 bg-zinc-800 mx-1" />

        {/* Reset Zoom & Pan */}
        <button
          onClick={() => handleZoomChange(1)}
          title={t("viewer.resetZoomPan")}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-all cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 text-white" />
          <span>Reset</span>
        </button>

        <div className="w-px h-4 bg-zinc-800 mx-1" />

        {/* Pin / Compare Toggle Button */}
        {!isComparing ? (
          <button
            onClick={onTogglePin}
            title={t("viewer.pinTooltip")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
              isPinned
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            {isPinned ? (
              <>
                <PinOff className="w-3.5 h-3.5 text-amber-400" />
                <span>{t("viewer.pinnedBadge")}</span>
              </>
            ) : (
              <>
                <Pin className="w-3.5 h-3.5 text-zinc-400" />
                <span>{t("viewer.compareBadge")}</span>
              </>
            )}
          </button>
        ) : (
          /* Split Mode Extra Controls */
          <>
            {/* Sync Zoom & Pan Toggle */}
            <button
              onClick={onToggleSyncZoomPan}
              title={isSyncZoomPan ? t("viewer.syncZoomTooltip") : t("viewer.freeZoomTooltip")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                isSyncZoomPan
                  ? 'bg-zinc-800 text-zinc-200 border border-zinc-700'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {isSyncZoomPan ? (
                <>
                  <Link2 className="w-3.5 h-3.5 text-zinc-300" />
                  <span className="hidden sm:inline">{t("viewer.syncZoom")}</span>
                </>
              ) : (
                <>
                  <Unlink className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="hidden sm:inline">{t("viewer.freeZoom")}</span>
                </>
              )}
            </button>

            {/* Swap Button */}
            {onSwapCompare && (
              <button
                onClick={onSwapCompare}
                title={t("viewer.swapAria")}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-all cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-white" />
                <span className="hidden sm:inline">A ↔ B</span>
              </button>
            )}

            {/* Close Split Button */}
            {onClearCompare && (
              <button
                onClick={onClearCompare}
                title={t("viewer.exitCompare")}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/15 transition-all cursor-pointer"
              >
                <X className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">{t("viewer.closeSplit")}</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* Bottom Visual Hint for Similares (positioned bottom-right) */}
      <button
        onClick={onScrollToSimilar}
        title={t("viewer.similar")}
        className="absolute bottom-5 right-6 md:right-10 z-20 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-zinc-900/85 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800/80 backdrop-blur-md text-xs font-medium transition-all cursor-pointer shadow-lg group"
      >
        <span>{t("viewer.similar")}</span>
        <ChevronDown className="w-3.5 h-3.5 text-white group-hover:translate-y-0.5 transition-transform" />
      </button>
    </div>
  )
})

