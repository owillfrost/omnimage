import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { X, ArrowLeftRight, Columns2, Workflow, Copy, Check } from 'lucide-react'
import type { Artwork } from '../types/artwork'
import type { SimilaritySortMode } from '../services/similarityService'
import { useViewerKeyboard } from '../hooks/useViewerKeyboard'
import { useSimilarItems } from '../hooks/useSimilarItems'
import { useItemDetail } from '../hooks/useItemDetail'
import { useTransientValue } from '../hooks/useCopyFeedback'
import { ImageStage } from './viewer/ImageStage'
import { SimilarGrid } from './viewer/SimilarGrid'
import { ViewerSidebar } from './viewer/ViewerSidebar'
import { useI18n } from "../i18n"

export interface ExploreFullscreenViewerProps {
  artwork: Artwork | null
  artworks: Artwork[]
  onClose: () => void
  onSelectArtwork: (artwork: Artwork) => void
  selectedColors: string[]
  onToggleColor: (hex: string) => void
  onSearchTag: (tag: string) => void
  folderNameMap?: Record<string, string>
  onSelectFolder?: (folderId: string | null) => void
}

/**
 * Fullscreen inspector. Composes:
 * - ImageStage   → hero image, split view (A | B), synchronized zoom/pan, prev/next
 * - SimilarGrid  → color & semantic similar references with compare pinning (Shift + Click)
 * - ViewerSidebar→ Eagle actions, color palette & comparative diffs (Palette & Prompt diff)
 */
export const ExploreFullscreenViewer: React.FC<ExploreFullscreenViewerProps> = ({
artwork,
  artworks,
  onClose,
  onSelectArtwork,
  selectedColors,
  onToggleColor,
  onSearchTag,
  folderNameMap,
  onSelectFolder,
}) => {
  const { t } = useI18n()
  const [fullLoaded, setFullLoaded] = useState(false)
  const [similarityMode, setSimilarityMode] = useState<SimilaritySortMode>('hybrid')
  const centerScrollRef = useRef<HTMLDivElement | null>(null)
  const similaresSectionRef = useRef<HTMLElement | null>(null)

  // Split View Comparison State (Priority 2.1)
  const [compareArtwork, setCompareArtwork] = useState<Artwork | null>(null)
  const [isPinned, setIsPinned] = useState(false)
  const [isSyncZoomPan, setIsSyncZoomPan] = useState(true)

  const { detail: itemDetail } = useItemDetail(artwork)
  const comfyMeta = itemDetail?.comfy?.hasWorkflow ? itemDetail.comfy : null
  const comfyPromptText =
    comfyMeta?.positivePrompt ||
    itemDetail?.annotation ||
    (artwork?.culture && artwork.culture !== 'Local Asset' ? artwork.culture : '')
  const [copiedTopAction, flashTopAction] = useTransientValue<'workflow' | 'prompt'>(2000)

  const handleCopyTopWorkflow = useCallback(async () => {
    if (!comfyMeta?.workflowJson) return
    try {
      await navigator.clipboard.writeText(comfyMeta.workflowJson)
      flashTopAction('workflow')
    } catch {
      // ignore clipboard error
    }
  }, [comfyMeta?.workflowJson, flashTopAction])

  const handleCopyTopPrompt = useCallback(async () => {
    if (!comfyPromptText) return
    try {
      await navigator.clipboard.writeText(comfyPromptText)
      flashTopAction('prompt')
    } catch {
      // ignore clipboard error
    }
  }, [comfyPromptText, flashTopAction])

  // Reset state immediately during render when base artwork changes
  const [prevArtworkId, setPrevArtworkId] = useState<string | undefined>(artwork?.id)
  if (artwork?.id !== prevArtworkId) {
    setPrevArtworkId(artwork?.id)
    setFullLoaded(false)
    // If new base artwork matches comparison item, clear comparison
    if (artwork && compareArtwork && artwork.id === compareArtwork.id) {
      setCompareArtwork(null)
      setIsPinned(false)
    }
  }

  // Scroll center area to top whenever artwork changes
  useEffect(() => {
    centerScrollRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [artwork?.id])

  const {
    similarArtworks,
    hasVisualEmbeddings,
    isLoading: isLoadingSimilar,
  } = useSimilarItems(artwork, artworks, fullLoaded, similarityMode)

  const currentIndex = useMemo(() => {
    if (!artwork) return -1
    return artworks.findIndex(a => a.id === artwork.id)
  }, [artwork, artworks])

  const handlePrev = useCallback(() => {
    if (artworks.length === 0 || currentIndex === -1) return
    onSelectArtwork(artworks[(currentIndex - 1 + artworks.length) % artworks.length])
  }, [artworks, currentIndex, onSelectArtwork])

  const handleNext = useCallback(() => {
    if (artworks.length === 0 || currentIndex === -1) return
    onSelectArtwork(artworks[(currentIndex + 1) % artworks.length])
  }, [artworks, currentIndex, onSelectArtwork])

  // Comparison Handlers
  const handleTogglePin = useCallback(() => {
    if (compareArtwork) {
      setCompareArtwork(null)
      setIsPinned(false)
    } else if (isPinned) {
      setIsPinned(false)
    } else {
      setIsPinned(true)
      // Instant gratification: pair with first similar reference if available
      if (similarArtworks.length > 0) {
        setCompareArtwork(similarArtworks[0])
      }
    }
  }, [compareArtwork, isPinned, similarArtworks])

  const handleSelectCompare = useCallback((item: Artwork) => {
    setCompareArtwork(item)
    setIsPinned(true)
    centerScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleSwapCompare = useCallback(() => {
    if (!compareArtwork || !artwork) return
    const prevA = artwork
    const prevB = compareArtwork
    onSelectArtwork(prevB)
    setCompareArtwork(prevA)
  }, [artwork, compareArtwork, onSelectArtwork])

  const handleClearCompare = useCallback(() => {
    setCompareArtwork(null)
    setIsPinned(false)
  }, [])

  const handleToggleSyncZoomPan = useCallback(() => {
    setIsSyncZoomPan(prev => !prev)
  }, [])

  useViewerKeyboard(!!artwork, {
    onClose,
    onPrev: handlePrev,
    onNext: handleNext,
    isComparing: !!compareArtwork,
    onTogglePin: handleTogglePin,
    onSwap: handleSwapCompare,
    onClearCompare: handleClearCompare,
  })

  const handleFullLoaded = useCallback(() => setFullLoaded(true), [])

  const handleScrollToSimilares = useCallback(() => {
    similaresSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const handleSelectSimilar = useCallback(
    (item: Artwork) => {
      // In comparison mode, clicking a similar item replaces Ref B
      if (compareArtwork) {
        handleSelectCompare(item)
      } else {
        centerScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
        onSelectArtwork(item)
      }
    },
    [compareArtwork, handleSelectCompare, onSelectArtwork]
  )

  if (!artwork) return null

  return (
    <div className="fixed inset-0 z-50 bg-[#09090b]/95 backdrop-blur-2xl flex flex-col lg:flex-row overflow-hidden animate-in fade-in duration-150">
      {/* Scrollable Center Area (Hero Stage + Similares Masonry) */}
      <div
        ref={centerScrollRef}
        className="flex-1 h-full overflow-y-auto overflow-x-hidden relative select-none scroll-smooth"
      >
        {/* Sticky Top Bar Inside Viewer */}
        <div className="sticky top-0 inset-x-0 z-30 flex items-center justify-between p-5 pointer-events-none bg-gradient-to-b from-[#09090b]/85 via-[#09090b]/40 to-transparent backdrop-blur-xs">
          {!compareArtwork ? (
            /* Single View Header Pill */
            <div className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-zinc-900/85 border border-zinc-800/80 backdrop-blur-md text-xs text-zinc-300 font-mono shadow-md">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: artwork.dominantColor }} />
              <span>{currentIndex !== -1 ? `${currentIndex + 1} / ${artworks.length}` : '1 / 1'}</span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-400 truncate max-w-[220px] font-sans">{artwork.title}</span>
            </div>
          ) : (
            /* Split View Dual Pill */
            <div className="pointer-events-auto flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900/90 border border-zinc-800/90 backdrop-blur-md text-xs font-mono shadow-lg">
              <Columns2 className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-white font-semibold">Ref A</span>
              <span className="text-zinc-600">•</span>
              <span className="text-amber-300 font-semibold">Ref B</span>
              <span className="text-zinc-600">|</span>
              <button
                onClick={handleSwapCompare}
                className="text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                title={t("viewer.swapAria")}
              >
                <ArrowLeftRight className="w-3 h-3 text-white" />
                <span className="text-[11px] hidden sm:inline">{t("viewer.swap")}</span>
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            {comfyMeta && (
              <div className="pointer-events-auto flex items-center gap-1.5 px-2 py-1 rounded-full bg-zinc-900/90 border border-zinc-800 backdrop-blur-md shadow-lg">
                <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 text-[10px] font-mono font-semibold uppercase tracking-wide">
                  <Workflow className="w-3 h-3 text-amber-400" />
                  ComfyUI
                </span>

                {comfyMeta.workflowJson && (
                  <button
                    onClick={handleCopyTopWorkflow}
                    title="Copiar JSON do Workflow ComfyUI (Cole direto no ComfyUI com Ctrl+V)"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-medium transition-colors cursor-pointer"
                  >
                    {copiedTopAction === 'workflow' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300">{t("viewer.workflowCopied")}</span>
                      </>
                    ) : (
                      <>
                        <Workflow className="w-3.5 h-3.5 text-amber-400" />
                        <span>{t("viewer.copyWorkflow")}</span>
                      </>
                    )}
                  </button>
                )}

                {comfyPromptText && (
                  <button
                    onClick={handleCopyTopPrompt}
                    title={t("viewer.copyComfyPrompt")}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-medium transition-colors cursor-pointer"
                  >
                    {copiedTopAction === 'prompt' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300">{t("viewer.promptCopied")}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-amber-400" />
                        <span>{t("viewer.copyPrompt")}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {compareArtwork && (
              <button
                onClick={handleClearCompare}
                title={t("viewer.closeSplit")}
                className="pointer-events-auto flex items-center gap-1.5 px-3 py-2 rounded-full bg-zinc-900/85 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800/80 backdrop-blur-md transition-all cursor-pointer shadow-lg text-xs"
              >
                <span>{t("viewer.closeSplit")}</span>
              </button>
            )}

            <button
              onClick={onClose}
              title={t("viewer.close") + " (Esc)"}
              className="pointer-events-auto flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-zinc-900/85 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800/80 backdrop-blur-md transition-all cursor-pointer shadow-lg"
            >
              <X className="w-4 h-4 text-white" />
              <span className="text-xs font-medium hidden sm:inline">{t("viewer.close")}</span>
            </button>
          </div>
        </div>

        <ImageStage
          key={artwork.id}
          artwork={artwork}
          compareArtwork={compareArtwork}
          isPinned={isPinned}
          isSyncZoomPan={isSyncZoomPan}
          showNav={artworks.length > 1}
          onPrev={handlePrev}
          onNext={handleNext}
          onFullLoaded={handleFullLoaded}
          onScrollToSimilar={handleScrollToSimilares}
          onTogglePin={handleTogglePin}
          onClearCompare={handleClearCompare}
          onSwapCompare={handleSwapCompare}
          onToggleSyncZoomPan={handleToggleSyncZoomPan}
        />

        <SimilarGrid
          ref={similaresSectionRef}
          items={similarArtworks}
          isLoading={isLoadingSimilar}
          hasVisualEmbeddings={hasVisualEmbeddings}
          mode={similarityMode}
          onModeChange={setSimilarityMode}
          scrollRootRef={centerScrollRef}
          onSelect={handleSelectSimilar}
          activeArtworkId={artwork.id}
          compareArtworkId={compareArtwork?.id}
          onCompareSelect={handleSelectCompare}
        />
      </div>

      <ViewerSidebar
        key={`${artwork.id}:${compareArtwork?.id || 'single'}`}
        artwork={artwork}
        compareArtwork={compareArtwork}
        selectedColors={selectedColors}
        onToggleColor={onToggleColor}
        onSearchTag={onSearchTag}
        folderNameMap={folderNameMap}
        onSelectFolder={onSelectFolder}
        onClose={onClose}
        onSwapCompare={handleSwapCompare}
        onClearCompare={handleClearCompare}
      />
    </div>
  )
}

