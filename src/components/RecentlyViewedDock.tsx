import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { Artwork } from "../types/artwork"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"
import { cn } from "@/lib/utils"
import { useI18n } from "../i18n"

export interface RecentlyViewedDockProps {
  items: Artwork[]
  activeArtworkId?: string | null
  compareArtworkId?: string | null
  onSelectArtwork: (artwork: Artwork) => void
  onCompareSelect?: (artwork: Artwork) => void
  onRestoreAnchor?: (artwork: Artwork) => void
  canGoBack?: boolean
  canGoForward?: boolean
  onGoBack?: () => void
  onGoForward?: () => void
  prevTitle?: string
  nextTitle?: string
}

export const RecentlyViewedDock: React.FC<RecentlyViewedDockProps> = React.memo(({
  items,
  activeArtworkId,
  compareArtworkId,
  onSelectArtwork,
  onCompareSelect,
  onRestoreAnchor,
  canGoBack = false,
  canGoForward = false,
  onGoBack,
  onGoForward,
  prevTitle,
  nextTitle,
}) => {
  if (!items || items.length === 0) return null

  const { t } = useI18n()
  const hasNavigation = Boolean(onGoBack || onGoForward)

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
        role="region"
        aria-label="Recently Viewed Visual History Trail"
      >
        <div className="pointer-events-auto flex items-center gap-1.5 bg-zinc-950/90 backdrop-blur-2xl border border-zinc-800/85 rounded-[22px] px-2.5 py-2 shadow-[0_18px_45px_rgba(0,0,0,0.8)]">
          {/* Back Arrow Button (Alt + Left) */}
          {hasNavigation && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onGoBack}
                  disabled={!canGoBack}
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 cursor-pointer select-none",
                    canGoBack
                      ? "text-zinc-300 hover:text-white hover:bg-zinc-800/80 active:scale-90"
                      : "text-zinc-650 opacity-30 cursor-not-allowed"
                  )}
                  aria-label={t("dock.shortcutAltLeft")}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {prevTitle ? (
                  <div className="space-y-0.5">
                    <span className="font-medium text-zinc-100 block truncate max-w-[200px]">
                      {t("dock.backToPrev", { title: prevTitle })}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">{t("dock.shortcutAltLeft")}</span>
                  </div>
                ) : (
                  <span className="text-zinc-400">{t("dock.firstAnchor")}</span>
                )}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Cascading Cards Fan */}
          <div className="flex items-center px-0.5">
            {items.map((artwork, index) => {
              const isActive = activeArtworkId === artwork.id
              const isCompare = compareArtworkId === artwork.id
              return (
                <Tooltip key={artwork.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => {
                        if (e.shiftKey && onCompareSelect) {
                          e.preventDefault()
                          onCompareSelect(artwork)
                        } else if (onRestoreAnchor) {
                          onRestoreAnchor(artwork)
                        } else {
                          onSelectArtwork(artwork)
                        }
                      }}
                      style={{
                        zIndex: index + 1,
                        backgroundColor: artwork.dominantColor || "#18181b",
                      }}
                      className={cn(
                        "group relative w-11 h-11 sm:w-12 sm:h-12 rounded-[10px] overflow-hidden shrink-0 cursor-pointer select-none",
                        "ring-[2.5px] ring-zinc-950 border border-white/20 shadow-lg",
                        "-rotate-[4deg] transition-all duration-200 ease-out",
                        "hover:rotate-0 hover:!z-30 hover:border-white/80 hover:shadow-xl",
                        "active:scale-95",
                        index > 0 && "-ml-2.5",
                        isActive && "ring-zinc-400 border-white -translate-y-1 rotate-0 !z-20 shadow-[0_0_15px_rgba(255,255,255,0.2)]",
                        isCompare && "ring-zinc-400 border-white -translate-y-1 rotate-0 !z-20"
                      )}
                      aria-label={artwork.title}
                    >
                      <img
                        src={artwork.thumbnailUrl}
                        alt={artwork.title}
                        decoding="async"
                        draggable={false}
                        className="w-full h-full object-cover pointer-events-none"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-xs space-y-0.5">
                    <div className="font-semibold text-zinc-100 truncate">{artwork.title}</div>
                    <span className="block text-[10px] text-zinc-400 font-medium">
                      {onRestoreAnchor ? t("dock.clickToNavigate") : t("dock.shiftClickCompare")}
                    </span>
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>

          {/* Forward Arrow Button (Alt + Right) */}
          {hasNavigation && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onGoForward}
                  disabled={!canGoForward}
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 cursor-pointer select-none",
                    canGoForward
                      ? "text-zinc-300 hover:text-white hover:bg-zinc-800/80 active:scale-90"
                      : "text-zinc-650 opacity-30 cursor-not-allowed"
                  )}
                  aria-label={t("dock.shortcutAltRight")}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {nextTitle ? (
                  <div className="space-y-0.5">
                    <span className="font-medium text-zinc-100 block truncate max-w-[200px]">
                      {t("dock.forwardToNext", { title: nextTitle })}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">{t("dock.shortcutAltRight")}</span>
                  </div>
                ) : (
                  <span className="text-zinc-400">{t("dock.lastAnchor")}</span>
                )}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
})

