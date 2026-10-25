import * as React from "react"
import { Plus, X, Pipette, Palette } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"
import { calculateColorDistance, type ColorFilterMode } from "../core/colorClustering"
import { ACCENT_PRESET_COLORS, MAX_FILTER_COLORS } from "../config/theme"
import {
  clamp,
  hsvToHex,
  hexToRgbStrict,
  rgbToHsv,
  normalizeHex,
  getNextDistinctColor,
} from "../core/colorConversion"
import { useColorPickerDrag } from "../hooks/useColorPickerDrag"
import { cn } from "@/lib/utils"

export interface ColorFilterPayload {
  colors: string[]
  mode: ColorFilterMode
}

export interface MultiColorPickerPopoverProps {
  selectedColors: string[]
  filterMode: ColorFilterMode
  maxColors?: number
  onFilterChange: (payload: ColorFilterPayload) => void
}

export const MultiColorPickerPopover: React.FC<MultiColorPickerPopoverProps> = ({
  selectedColors,
  filterMode,
  maxColors = MAX_FILTER_COLORS,
  onFilterChange,
}) => {
  // Continuous HSV state for the 2D picker
  const [hsv, setHsv] = React.useState<[number, number, number]>([215, 0.72, 0.96])
  const currentColor = React.useMemo(() => hsvToHex(hsv[0], hsv[1], hsv[2]), [hsv])

  // Track which chip slot is currently being live-edited (defaults to last slot)
  const [activeSlotIndex, setActiveSlotIndex] = React.useState<number>(0)
  const safeActiveSlotIndex =
    selectedColors.length === 0 ? 0 : clamp(activeSlotIndex, 0, selectedColors.length - 1)

  // Controlled HEX text input state
  const [hexInput, setHexInput] = React.useState<string>(currentColor)
  const [isHexValid, setIsHexValid] = React.useState<boolean>(true)

  const supportsEyeDropper = typeof window !== "undefined" && "EyeDropper" in window

  const rafRef = React.useRef<number | null>(null)
  const lastEmittedHexRef = React.useRef<string>("")

  React.useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  /**
   * Live-syncs the picked color directly into the active filter slot so dragging
   * immediately filters the gallery without needing to click "Adicionar".
   * Uses a perceptual CIELAB threshold (Delta-E >= 2.2) during continuous drag so
   * imperceptible 1px mouse tremors don't cause boundary cards to flicker.
   */
  const syncLiveColorToFilter = React.useCallback(
    (nextHsv: [number, number, number], forceCommit = false, syncHexField = true) => {
      const nextHex = hsvToHex(nextHsv[0], nextHsv[1], nextHsv[2])
      setHsv(nextHsv)
      if (syncHexField) {
        setHexInput(nextHex)
        setIsHexValid(true)
      }

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        // If no colors are active yet, dragging automatically activates the 1st color slot!
        if (selectedColors.length === 0) {
          lastEmittedHexRef.current = nextHex
          setActiveSlotIndex(0)
          onFilterChange({ colors: [nextHex], mode: filterMode })
          return
        }

        // Perceptual hysteresis: skip re-filtering the 22k items if the color changed by less than 2.2 Delta-E during drag
        if (
          !forceCommit &&
          lastEmittedHexRef.current &&
          calculateColorDistance(lastEmittedHexRef.current, nextHex) < 2.2
        ) {
          return
        }

        const targetIdx = safeActiveSlotIndex
        const duplicateInOtherSlot = selectedColors.some(
          (c, idx) => idx !== targetIdx && c.toUpperCase() === nextHex.toUpperCase()
        )
        if (duplicateInOtherSlot) return

        if (selectedColors[targetIdx]?.toUpperCase() === nextHex.toUpperCase()) return

        lastEmittedHexRef.current = nextHex
        const nextColors = selectedColors.slice()
        nextColors[targetIdx] = nextHex
        onFilterChange({ colors: nextColors, mode: filterMode })
      })
    },
    [selectedColors, safeActiveSlotIndex, filterMode, onFilterChange]
  )

  const {
    svBoxRef,
    hueBarRef,
    handleSvPointerDown,
    handleSvPointerMove,
    handleSvPointerUp,
    handleHuePointerDown,
    handleHuePointerMove,
    handleHuePointerUp,
  } = useColorPickerDrag({
    hsv,
    onHsvChange: syncLiveColorToFilter,
  })


  // Handle manual HEX typing — also live-updates the active slot when a valid 6-digit hex is typed
  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setHexInput(raw)
    const rgb = hexToRgbStrict(raw)
    if (rgb) {
      setIsHexValid(true)
      const nextHsv = rgbToHsv(rgb[0], rgb[1], rgb[2])
      syncLiveColorToFilter(nextHsv, false, false)
    } else {
      setIsHexValid(false)
    }
  }

  const handleHexInputBlur = () => {
    const normalized = normalizeHex(hexInput)
    if (normalized) {
      setHexInput(normalized)
      setIsHexValid(true)
    } else {
      setHexInput(currentColor)
      setIsHexValid(true)
    }
  }

  /**
   * "+ Adicionar" button:
   * - If no color is active yet, adds currentColor as the 1st chip.
   * - If colors are already active (and < maxColors), adds a new color slot and focuses it
   *   so the user can immediately drag to adjust the new color!
   */
  const handleAddColorSlot = () => {
    if (selectedColors.length >= maxColors) return

    const baseHex = normalizeHex(hexInput) || currentColor
    if (selectedColors.length === 0) {
      setActiveSlotIndex(0)
      setHexInput(baseHex)
      setIsHexValid(true)
      onFilterChange({ colors: [baseHex], mode: filterMode })
      return
    }

    // If currentColor isn't in selectedColors yet, add it directly
    if (!selectedColors.some((c) => c.toUpperCase() === baseHex.toUpperCase())) {
      const nextColors = [...selectedColors, baseHex]
      setActiveSlotIndex(nextColors.length - 1)
      setHexInput(baseHex)
      setIsHexValid(true)
      onFilterChange({ colors: nextColors, mode: filterMode })
      return
    }

    // Otherwise create a new distinct color slot and focus it so user can drag it right away
    const nextHsv = getNextDistinctColor(selectedColors, hsv)
    const nextHex = hsvToHex(nextHsv[0], nextHsv[1], nextHsv[2])
    const nextColors = [...selectedColors, nextHex]
    setHsv(nextHsv)
    setHexInput(nextHex)
    setIsHexValid(true)
    setActiveSlotIndex(nextColors.length - 1)
    onFilterChange({ colors: nextColors, mode: filterMode })
  }

  // Select an existing chip to edit it live with the 2D picker
  const handleSelectChipSlot = (hex: string, index: number) => {
    setActiveSlotIndex(index)
    const rgb = hexToRgbStrict(hex)
    if (rgb) {
      const nextHsv = rgbToHsv(rgb[0], rgb[1], rgb[2])
      setHsv(nextHsv)
      setHexInput(hsvToHex(nextHsv[0], nextHsv[1], nextHsv[2]))
      setIsHexValid(true)
    }
  }

  // Remove a specific color chip
  const handleRemoveColor = (hexToRemove: string) => {
    const nextColors = selectedColors.filter(
      (c) => c.toUpperCase() !== hexToRemove.toUpperCase()
    )
    onFilterChange({ colors: nextColors, mode: filterMode })
  }

  // Clear all active colors
  const handleClearAll = () => {
    onFilterChange({ colors: [], mode: filterMode })
  }

  // Switch filter logic mode ('OR' vs 'AND')
  const handleModeChange = (nextMode: ColorFilterMode) => {
    if (nextMode === filterMode) return
    onFilterChange({ colors: selectedColors, mode: nextMode })
  }

  // Native Chromium EyeDropper to sample any color directly from the canvas
  const handlePickScreenColor = async () => {
    try {
      // @ts-expect-error EyeDropper API available in Chromium browsers
      const eyeDropper = new window.EyeDropper()
      const result = await eyeDropper.open()
      if (result?.sRGBHex) {
        const rgb = hexToRgbStrict(result.sRGBHex)
        if (rgb) {
          syncLiveColorToFilter(rgbToHsv(rgb[0], rgb[1], rgb[2]))
        }
      }
    } catch {
      // User canceled eyedropper
    }
  }

  const isAtMaxLimit = selectedColors.length >= maxColors
  const currentHue = hsv[0]
  const pureHueHex = React.useMemo(() => hsvToHex(currentHue, 1, 1), [currentHue])

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative p-2 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 active:scale-95 transition-all cursor-pointer"
              aria-label="Filtrar por cores"
            >
              <Palette className="w-4 h-4" />
              {selectedColors.length > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-zinc-100 text-zinc-950 text-[10px] font-bold flex items-center justify-center border border-zinc-900 shadow"
                  style={
                    selectedColors.length === 1
                      ? { backgroundColor: selectedColors[0], color: "#ffffff" }
                      : undefined
                  }
                >
                  {selectedColors.length}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Filtrar por cores</TooltipContent>
      </Tooltip>

      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[310px] p-4 bg-zinc-950/95 backdrop-blur-2xl border border-zinc-800/90 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.85)] text-zinc-100 select-none"
      >
        <div className="space-y-3.5">
          {/* 1. Header: Title + Segmented Control (OR vs AND) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide text-zinc-100">
                Filtrar por cores
              </span>
              <span className="text-[10px] text-zinc-500">
                Arraste para filtrar ao vivo
              </span>
            </div>

            <div
              className="flex items-center gap-1 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800/80"
              role="tablist"
              aria-label="Modo de combinação de cores"
            >
              <button
                type="button"
                role="tab"
                aria-selected={filterMode === "OR"}
                onClick={() => handleModeChange("OR")}
                className={cn(
                  "flex-1 py-1 px-2.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer",
                  filterMode === "OR"
                    ? "bg-zinc-800 text-white shadow-sm ring-1 ring-white/10"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                Qualquer (OR)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filterMode === "AND"}
                onClick={() => handleModeChange("AND")}
                className={cn(
                  "flex-1 py-1 px-2.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer",
                  filterMode === "AND"
                    ? "bg-zinc-800 text-white shadow-sm ring-1 ring-white/10"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                Combinar (AND)
              </button>
            </div>
          </div>

          {/* 2. Continuous 2D Color Picker Area (Live-Synced Saturation/Value + Hue Slider) */}
          <div className="space-y-2.5">
            {/* 2D Saturation / Value Plane */}
            <div
              ref={svBoxRef}
              onPointerDown={handleSvPointerDown}
              onPointerMove={handleSvPointerMove}
              onPointerUp={handleSvPointerUp}
              onPointerCancel={handleSvPointerUp}
              className="relative w-full h-36 rounded-xl overflow-hidden cursor-crosshair border border-white/10 shadow-inner touch-none"
              style={{ backgroundColor: pureHueHex }}
            >
              {/* Horizontal White-to-Transparent Saturation Gradient */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(to right, #ffffff 0%, rgba(255,255,255,0) 100%)",
                }}
              />
              {/* Vertical Transparent-to-Black Value Gradient */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, #000000 100%)",
                }}
              />

              {/* 2D Thumb Handle */}
              <div
                className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.85),0_2px_6px_rgba(0,0,0,0.6)] pointer-events-none"
                style={{
                  left: `${hsv[1] * 100}%`,
                  top: `${(1 - hsv[2]) * 100}%`,
                  backgroundColor: currentColor,
                }}
              />
            </div>

            {/* 1D Horizontal Hue Rainbow Slider */}
            <div
              ref={hueBarRef}
              onPointerDown={handleHuePointerDown}
              onPointerMove={handleHuePointerMove}
              onPointerUp={handleHuePointerUp}
              onPointerCancel={handleHuePointerUp}
              className="relative w-full h-3.5 rounded-full cursor-pointer border border-white/10 shadow-inner touch-none"
              style={{
                background:
                  "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
              }}
            >
              <div
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white ring-2 ring-zinc-950 shadow-md pointer-events-none"
                style={{
                  left: `${(hsv[0] / 360) * 100}%`,
                  backgroundColor: pureHueHex,
                }}
              />
            </div>

            {/* Quick 4-Accent Preset Swatches */}
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[10px] text-zinc-500 font-medium mr-1">Presets:</span>
              <div className="flex items-center gap-1.5 flex-1">
                {ACCENT_PRESET_COLORS.map((preset) => {
                  const isSelected = selectedColors.some(
                    (c) => c.toUpperCase() === preset.hex.toUpperCase()
                  );
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        const rgb = hexToRgbStrict(preset.hex);
                        if (rgb) {
                          const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
                          syncLiveColorToFilter([h, s, v], true, true);
                        }
                      }}
                      title={`${preset.label} (${preset.hex})`}
                      className={cn(
                        "w-5 h-5 rounded-full border transition-transform active:scale-90 cursor-pointer flex items-center justify-center",
                        isSelected
                          ? "border-white ring-2 ring-white/30 scale-110"
                          : "border-white/20 hover:scale-105 hover:border-white/60"
                      )}
                      style={{ backgroundColor: preset.hex }}
                    />
                  );
                })}
              </div>
            </div>

            {/* HEX Input + EyeDropper + Dark Sub-tone "+ Adicionar" Button */}
            <div className="flex items-center gap-1.5 pt-0.5">
              {/* HEX Field with Live Color Preview Swatch */}
              <div
                className={cn(
                  "flex items-center gap-1.5 bg-zinc-900/90 border rounded-xl px-2.5 py-1.5 flex-1 min-w-0 transition-colors",
                  isHexValid
                    ? "border-zinc-800 focus-within:border-zinc-600"
                    : "border-red-500/70"
                )}
              >
                <span
                  className="w-4 h-4 rounded-full border border-white/20 shrink-0 shadow-xs"
                  style={{ backgroundColor: currentColor }}
                />
                <input
                  type="text"
                  value={hexInput}
                  onChange={handleHexInputChange}
                  onBlur={handleHexInputBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleAddColorSlot()
                    }
                  }}
                  maxLength={7}
                  spellCheck={false}
                  aria-label="Código HEX da cor"
                  className="w-full bg-transparent text-xs font-mono text-zinc-100 focus:outline-none uppercase tracking-wider"
                />
              </div>

              {/* Optional Native Screen EyeDropper Button */}
              {supportsEyeDropper && (
                <button
                  type="button"
                  onClick={handlePickScreenColor}
                  title="Capturar cor da tela (Conta-gotas)"
                  className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-colors shrink-0 cursor-pointer"
                >
                  <Pipette className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Action Button: Dark Mode Sub-tone "+ Adicionar" (adds a new color slot) */}
              <button
                type="button"
                disabled={isAtMaxLimit}
                onClick={handleAddColorSlot}
                title={
                  isAtMaxLimit
                    ? `Limite máximo de ${maxColors} cores atingido`
                    : "Adicionar mais uma cor para combinar no filtro"
                }
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-medium border transition-all shrink-0",
                  isAtMaxLimit
                    ? "bg-zinc-900/50 border-zinc-800/60 text-zinc-600 cursor-not-allowed"
                    : "bg-zinc-900 hover:bg-zinc-800 border-zinc-700/80 hover:border-zinc-600 text-zinc-200 hover:text-white shadow-sm active:scale-95 cursor-pointer"
                )}
              >
                <Plus className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                <span>Adicionar</span>
              </button>
            </div>
          </div>

          {/* 3. Active Color Chips Section */}
          <div className="pt-2.5 border-t border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-400">
                <strong className="text-zinc-200">{selectedColors.length}</strong> de {maxColors} cores selecionadas
              </span>
              {selectedColors.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-[11px] font-medium text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
                >
                  Limpar todas
                </button>
              )}
            </div>

            {selectedColors.length === 0 ? (
              <div className="py-2.5 px-3 rounded-xl border border-dashed border-zinc-800/80 bg-zinc-900/30 text-center">
                <span className="text-[11px] text-zinc-500">
                  Arraste no seletor acima para filtrar automaticamente por cor.
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {selectedColors.map((hex, idx) => {
                  const isFocusedSlot = idx === clamp(activeSlotIndex, 0, selectedColors.length - 1)
                  return (
                    <div
                      key={`${hex}-${idx}`}
                      onClick={() => handleSelectChipSlot(hex, idx)}
                      title="Clique para ajustar este tom ao vivo no seletor"
                      className={cn(
                        "group inline-flex items-center gap-1.5 rounded-full pl-2 pr-1.5 py-1 text-[11px] font-mono shadow-xs cursor-pointer transition-all border",
                        isFocusedSlot
                          ? "bg-zinc-800 border-zinc-500 text-white ring-1 ring-white/15"
                          : "bg-zinc-900/90 hover:bg-zinc-800/70 border-zinc-800 text-zinc-300"
                      )}
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-white/25 shrink-0"
                        style={{ backgroundColor: hex }}
                      />
                      <span>{hex.toUpperCase()}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveColor(hex)
                        }}
                        className="p-0.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-700/70 transition-colors"
                        aria-label={`Remover cor ${hex}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
