import * as React from "react"
import { RotateCcw, Compass, Grid3x3, LayoutGrid, Maximize2, Shuffle, CircleHelp, RefreshCw } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"
import { AsciiReveal } from "./ui/AsciiReveal"
import type { GridSizeMode } from "../core/infiniteGrid"
import { useI18n } from "../i18n"

export interface CanvasControlsProps {
  onCenterView: () => void
  onShuffle?: () => void
  onRefresh?: () => void
  isRefreshing?: boolean
  onOpenShortcuts?: () => void
  visibleCount: number
  totalCount: number
  gridSize: GridSizeMode
  onGridSizeChange: (size: GridSizeMode) => void
  centerLabel?: string
}

export const CanvasControls: React.FC<CanvasControlsProps> = React.memo(({
  onCenterView,
  onShuffle,
  onRefresh,
  isRefreshing,
  onOpenShortcuts,
  visibleCount,
  totalCount,
  gridSize,
  onGridSizeChange,
  centerLabel,
}) => {
  const { t } = useI18n()

  const gridOptions = React.useMemo(() => [
    { mode: "small" as GridSizeMode, tooltip: t('canvas.gridSmall'), icon: Grid3x3 },
    { mode: "default" as GridSizeMode, tooltip: t('canvas.gridDefault'), icon: LayoutGrid },
    { mode: "large" as GridSizeMode, tooltip: t('canvas.gridLarge'), icon: Maximize2 },
  ], [t])

  const effectiveCenterLabel = centerLabel || t('common.recenterGrid')

  return (
    <TooltipProvider>
      <div className="fixed bottom-6 right-6 z-30 flex items-center gap-2 pointer-events-none">
        {/* Count Pill */}
        <div className="pointer-events-auto hidden sm:flex items-center gap-2 bg-zinc-950/85 backdrop-blur-xl border border-zinc-800 rounded-full px-3.5 py-1.5 text-xs text-zinc-400 shadow-xl font-mono">
          <Compass className="w-3.5 h-3.5 text-zinc-300" data-ascii="skip" />
          <AsciiReveal
            key={`${totalCount}`}
            preset="terminal"
            duration="fast"
            speed={1.5}
            className="inline-flex items-center gap-1"
          >
            <span data-ascii-digits className="text-zinc-100 font-semibold">{visibleCount}</span>
            <span className="text-zinc-500">/</span>
            <span data-ascii-digits className="text-zinc-400">{totalCount}</span>
            <span className="text-zinc-400 text-[11px] ml-0.5">{t('common.worksInView')}</span>
          </AsciiReveal>
        </div>

        {/* Grid Density Selector (3 Icons) */}
        <div
          className="pointer-events-auto bg-zinc-950/90 backdrop-blur-2xl border border-zinc-800 rounded-full p-1 shadow-2xl flex items-center gap-0.5"
          role="group"
          aria-label={t('canvas.gridControlsAria')}
        >
          {gridOptions.map(({ mode, tooltip, icon: Icon }) => {
            const isActive = gridSize === mode
            return (
              <Tooltip key={mode}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onGridSizeChange(mode)}
                    className={`p-2 rounded-full active:scale-95 transition-all cursor-pointer ${
                      isActive
                        ? "bg-zinc-800 text-white shadow-sm"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                    }`}
                    aria-label={tooltip}
                    aria-pressed={isActive}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{tooltip}</TooltipContent>
              </Tooltip>
            )
          })}
        </div>

        {/* Shuffle & Recenter Buttons */}
        <div className="pointer-events-auto flex items-center gap-0.5 bg-zinc-950/90 backdrop-blur-2xl border border-zinc-800 rounded-full p-1 shadow-2xl">
          {onRefresh && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  aria-label={t('canvas.refreshEagle')}
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-blue-400" : ""}`} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('canvas.refreshEagle')}</TooltipContent>
            </Tooltip>
          )}

          {onShuffle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onShuffle}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full active:scale-95 transition-all cursor-pointer"
                  aria-label={t('canvas.shuffleAria')}
                >
                  <Shuffle className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('canvas.shuffleAria')}</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onCenterView}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full active:scale-95 transition-all cursor-pointer"
                aria-label={effectiveCenterLabel}
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{effectiveCenterLabel}</TooltipContent>
          </Tooltip>

          {onOpenShortcuts && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onOpenShortcuts}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full active:scale-95 transition-all cursor-pointer"
                  aria-label={t('canvas.shortcutsButton')}
                >
                  <CircleHelp className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('canvas.shortcutsButton')}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
})



