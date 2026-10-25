import * as React from "react"
import { RotateCcw, Compass, Grid3x3, LayoutGrid, Maximize2, Shuffle, CircleHelp, RefreshCw } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"
import { AsciiReveal } from "./ui/AsciiReveal"
import type { GridSizeMode } from "../core/infiniteGrid"

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

const GRID_SIZE_OPTIONS: {
  mode: GridSizeMode
  tooltip: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { mode: "small", tooltip: "Grid Pequeno (Compacto)", icon: Grid3x3 },
  { mode: "default", tooltip: "Grid Padrão (Médio)", icon: LayoutGrid },
  { mode: "large", tooltip: "Grid Largo (Amplo)", icon: Maximize2 },
]

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
  centerLabel = "Recenter Grid",
}) => {
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
            <span className="text-zinc-400 text-[11px] ml-0.5">works in view</span>
          </AsciiReveal>
        </div>

        {/* Grid Density Selector (3 Icons) */}
        <div
          className="pointer-events-auto bg-zinc-950/90 backdrop-blur-2xl border border-zinc-800 rounded-full p-1 shadow-2xl flex items-center gap-0.5"
          role="group"
          aria-label="Grid Density Controls"
        >
          {GRID_SIZE_OPTIONS.map(({ mode, tooltip, icon: Icon }) => {
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
                  aria-label="Atualizar Biblioteca do Eagle (?refresh=1)"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-blue-400" : ""}`} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Atualizar do Eagle (?refresh=1)</TooltipContent>
            </Tooltip>
          )}

          {onShuffle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onShuffle}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full active:scale-95 transition-all cursor-pointer"
                  aria-label="Visualização Randômica (Embaralhar)"
                >
                  <Shuffle className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Visualização Randômica (Embaralhar)</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onCenterView}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full active:scale-95 transition-all cursor-pointer"
                aria-label={centerLabel}
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{centerLabel}</TooltipContent>
          </Tooltip>

          {onOpenShortcuts && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onOpenShortcuts}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full active:scale-95 transition-all cursor-pointer"
                  aria-label="Atalhos (?)"
                >
                  <CircleHelp className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Atalhos (?)</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
})



