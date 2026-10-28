import * as React from "react"
import {
  ChevronUp,
  ChevronDown,
  FolderOpen,
  Sliders,
  ShieldCheck,
  Filter,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Palette,
  Info,
  Layers,
  ArrowRight,
} from "lucide-react"
import { useI18n } from "../i18n"
import type { Artwork } from "../types/artwork"
import type { GradeTuningOptions } from "../core/colorClustering"
import { isAnchorNeutral } from "../core/colorClustering"
import {
  type SplitToningProfile,
  deriveFallbackSplitToningFromPalette,
} from "../core/paletteExtractor"
import { labToHex } from "../core/colorConversion"
import type { SimilaritySortMode } from "../workers/colorSort.worker"

export interface FloatingInfoCardProps {
  isEagleConnected?: boolean
  totalCount?: number
  currentLibraryName?: string
  activeTab?: string
  anchorArtwork?: Artwork | null
  anchorMode?: SimilaritySortMode
  onSelectAnchorMode?: (mode: SimilaritySortMode) => void
  gradeTuning?: GradeTuningOptions
  onGradeTuningChange?: (tuning: GradeTuningOptions) => void
  isOpen?: boolean
  onToggleOpen?: () => void
}

export const FloatingInfoCard: React.FC<FloatingInfoCardProps> = React.memo(({
  isEagleConnected = true,
  totalCount = 0,
  currentLibraryName = "Design",
  anchorArtwork,
  anchorMode = "grade",
  onSelectAnchorMode,
  gradeTuning,
  onGradeTuningChange,
  isOpen,
  onToggleOpen,
}) => {
  const { t } = useI18n()
  const [internalExpanded, setInternalExpanded] = React.useState(true)
  const [isAdvancedOpen, setIsAdvancedOpen] = React.useState(false)

  const isExpanded = isOpen !== undefined ? isOpen : internalExpanded
  const toggleExpanded = () => {
    if (onToggleOpen) {
      onToggleOpen()
    } else {
      setInternalExpanded(!internalExpanded)
    }
  }

  const isGradeMode = anchorMode === "grade"

  // Current tuning values with defaults
  const sensitivityPct = Math.round((gradeTuning?.sensitivity ?? 0.75) * 100)
  const balanceVal = gradeTuning?.balance ?? 0
  const protectSkin = gradeTuning?.protectSkinTones !== false
  const excludeNeutrals = Boolean(gradeTuning?.excludeNeutrals)

  // Derive Split Toning profile for anchor if present
  const anchorGrade: SplitToningProfile | null = React.useMemo(() => {
    if (!anchorArtwork) return null
    if (anchorArtwork.splitToning) return anchorArtwork.splitToning
    const colors =
      anchorArtwork.palette && anchorArtwork.palette.length > 0
        ? anchorArtwork.palette
        : [anchorArtwork.dominantColor || "#18181b"]
    return deriveFallbackSplitToningFromPalette(colors, anchorArtwork.paletteWeights)
  }, [anchorArtwork])

  // Swatch hex colors derived from Lab (a, b) with overrides applied
  const shadowHex = React.useMemo(() => {
    if (!anchorGrade) return "#18181b"
    const a = gradeTuning?.shadowOverride ? gradeTuning.shadowOverride.a : anchorGrade.shadows.a
    const b = gradeTuning?.shadowOverride ? gradeTuning.shadowOverride.b : anchorGrade.shadows.b
    return labToHex(anchorGrade.shadows.L, a, b)
  }, [anchorGrade, gradeTuning?.shadowOverride])

  const highlightHex = React.useMemo(() => {
    if (!anchorGrade) return "#f4f4f5"
    const h =
      protectSkin && anchorGrade.highlightsProtected
        ? anchorGrade.highlightsProtected
        : anchorGrade.highlightsRaw || anchorGrade.highlights
    const a = gradeTuning?.highlightOverride ? gradeTuning.highlightOverride.a : h.a
    const b = gradeTuning?.highlightOverride ? gradeTuning.highlightOverride.b : h.b
    return labToHex(h.L, a, b)
  }, [anchorGrade, gradeTuning?.highlightOverride, protectSkin])

  // Detect whether the anchor image itself is near-neutral
  const isNeutralAnchor = React.useMemo(() => {
    return anchorGrade ? isAnchorNeutral(anchorGrade) : false
  }, [anchorGrade])

  const hasAnyOverride = Boolean(
    balanceVal !== 0 ||
      sensitivityPct !== 75 ||
      !protectSkin ||
      excludeNeutrals ||
      gradeTuning?.shadowOverride ||
      gradeTuning?.highlightOverride
  )

  const handleSensitivityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    onGradeTuningChange?.({
      ...gradeTuning,
      sensitivity: val / 100,
    })
  }

  const handleBalanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    onGradeTuningChange?.({
      ...gradeTuning,
      balance: val,
    })
  }

  const handleToggleSkinProtection = () => {
    onGradeTuningChange?.({
      ...gradeTuning,
      protectSkinTones: !protectSkin,
    })
  }

  const handleToggleExcludeNeutrals = () => {
    onGradeTuningChange?.({
      ...gradeTuning,
      excludeNeutrals: !excludeNeutrals,
    })
  }

  const handleResetTuning = () => {
    onGradeTuningChange?.({
      balance: 0,
      sensitivity: 0.75,
      protectSkinTones: true,
      excludeNeutrals: false,
      shadowOverride: undefined,
      highlightOverride: undefined,
    })
  }

  // Anchor palette with weights for 'color' mode preview
  const anchorPalette = anchorArtwork?.palette || (anchorArtwork?.dominantColor ? [anchorArtwork.dominantColor] : [])
  const anchorWeights = anchorArtwork?.paletteWeights || anchorPalette.map(() => 1 / Math.max(1, anchorPalette.length))

  return (
    <aside className="fixed bottom-6 left-6 z-30 pointer-events-none w-88 sm:w-96 max-w-[calc(100vw-3rem)] select-none">
      <div className="pointer-events-auto bg-zinc-950/95 backdrop-blur-2xl border border-zinc-800/80 rounded-[28px] overflow-hidden shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] flex flex-col max-h-[calc(100vh-6rem)]">
        {/* Card Header */}
        <div className="p-4 flex items-center justify-between border-b border-zinc-800/60 bg-zinc-900/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-zinc-800/80 border border-zinc-700/60 rounded-full px-2.5 py-1 flex items-center gap-1.5 shadow-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  anchorArtwork ? (isGradeMode ? "bg-blue-400" : "bg-emerald-400") : isEagleConnected ? "bg-blue-400" : "bg-amber-400 animate-pulse"
                }`}
              />
              <span className="text-[11px] font-bold tracking-wider text-zinc-100 uppercase">
                {anchorArtwork ? t("nav.searchSettingsTitle") : isEagleConnected ? "Gallery" : t("infoCard.loadingTitle")}
              </span>
            </div>
            {anchorArtwork && isGradeMode && hasAnyOverride && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" title="Tuning active" />
            )}
            <span className="text-[10px] text-zinc-500 font-mono">Omnimage</span>
          </div>

          <div className="flex items-center gap-1">
            {anchorArtwork && isGradeMode && hasAnyOverride && isExpanded && (
              <button
                type="button"
                onClick={handleResetTuning}
                className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                title={t("nav.gradeResetTuning")}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={toggleExpanded}
              className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Expandable Body */}
        {isExpanded && (
          <div className="p-4.5 space-y-4 overflow-y-auto overflow-x-hidden text-zinc-200 text-xs custom-scrollbar">
            {/* 1. If NO anchor is selected: show clean Library Info card */}
            {!anchorArtwork ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                      {t("infoCard.connectedTitle")}
                    </span>
                    <span className="text-[10px] text-blue-400 font-mono">
                      {totalCount} {t("common.items").toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    {t("infoCard.viewingLibrary", { name: currentLibraryName })}
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-900/40 border border-zinc-800/60 flex items-start gap-2.5 text-zinc-400">
                  <Sparkles className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    {t("nav.searchSettingsNoAnchor")}
                  </p>
                </div>
              </div>
            ) : (
              /* 2. When an Anchor IS selected: show anchor header + mode switcher */
              <>
                {/* Anchor Summary Header */}
                <div className="p-2.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/70 flex items-center gap-3">
                  <img
                    src={anchorArtwork.thumbnailUrl || anchorArtwork.imageUrl}
                    alt={anchorArtwork.title}
                    className="w-10 h-10 rounded-xl object-cover border border-zinc-700/60 shrink-0 bg-zinc-800"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-zinc-100 truncate text-[11px]">
                        {anchorArtwork.title || "Anchor Reference"}
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase font-bold">
                        {anchorMode}
                      </span>
                    </div>

                    {/* Grade mode shows shadows/highlights swatches */}
                    {isGradeMode && (
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center -space-x-1">
                          <span
                            className="w-3 h-3 rounded-full border border-black/30 shadow-xs"
                            style={{ backgroundColor: shadowHex }}
                            title={`Shadows: ${shadowHex}`}
                          />
                          <span
                            className="w-3 h-3 rounded-full border border-black/30 shadow-xs"
                            style={{ backgroundColor: highlightHex }}
                            title={`Highlights: ${highlightHex}`}
                          />
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono truncate">
                          {shadowHex} / {highlightHex}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Mode Selector Pill Row */}
                {onSelectAnchorMode && (
                  <div className="flex items-center gap-1 p-1 bg-zinc-900/70 border border-zinc-800/80 rounded-xl">
                    {(["grade", "hybrid", "color", "visual"] as SimilaritySortMode[]).map((m) => {
                      const isActive = anchorMode === m
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => onSelectAnchorMode(m)}
                          className={`flex-1 py-1 rounded-lg text-[10px] font-semibold tracking-wider uppercase transition-all cursor-pointer ${
                            isActive
                              ? "bg-zinc-100 text-zinc-950 shadow-xs"
                              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                          }`}
                        >
                          {m}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* --- CASE A: GRADE MODE (Active Search Controls) --- */}
                {isGradeMode && (
                  <div className="space-y-3.5 pt-1 animate-in fade-in-50 duration-200">
                    <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400">
                      <span className="flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-zinc-400" />
                        {t("nav.searchControlsInstant")}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">60 fps</span>
                    </div>

                    {/* Control 1: Grade Sensitivity Slider */}
                    <div className="space-y-1.5 p-3 rounded-2xl bg-zinc-900/40 border border-zinc-800/60">
                      <div className="flex items-center justify-between text-zinc-300">
                        <span className="font-medium text-[11px]">{t("nav.gradeSensitivity")}</span>
                        <span className="font-mono text-[11px] text-blue-400 font-bold">{sensitivityPct}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={sensitivityPct}
                        onChange={handleSensitivityChange}
                        className="w-full accent-blue-400 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                      />
                      <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                        <span>Amplo</span>
                        <span className="text-[9px] text-zinc-400">
                          {sensitivityPct < 40
                            ? "Tolera variações de tom"
                            : sensitivityPct > 80
                            ? "Corte rígido (exclusão < piso)"
                            : "Distribuição calibrada"}
                        </span>
                        <span>Rigoroso</span>
                      </div>
                    </div>

                    {/* Control 2: Balance Slider (Sombras ↔ Altas Luzes) */}
                    <div className="space-y-2 p-3 rounded-2xl bg-zinc-900/40 border border-zinc-800/60">
                      <div className="flex items-center justify-between text-zinc-300">
                        <span className="font-medium text-[11px]">{t("nav.gradeBalance")}</span>
                        <span className="font-mono text-[11px] text-zinc-300">
                          {balanceVal === 0
                            ? t("nav.gradeBalanced")
                            : balanceVal > 0
                            ? `+${balanceVal}% Luzes`
                            : `${balanceVal}% Sombras`}
                        </span>
                      </div>

                      {/* Hardware-Accelerated Gradient Ramp Strip */}
                      <div className="relative pt-0.5">
                        <div
                          className="h-2 w-full rounded-full border border-zinc-700/60 shadow-inner relative overflow-hidden"
                          style={{
                            background: `linear-gradient(to right, ${shadowHex}, ${highlightHex})`,
                          }}
                        >
                          {/* Center 50/50 notch indicator */}
                          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-black/50 -translate-x-1/2" />
                        </div>
                      </div>

                      <input
                        type="range"
                        min="-100"
                        max="100"
                        step="5"
                        value={balanceVal}
                        onChange={handleBalanceChange}
                        className="w-full accent-blue-400 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                      />
                      <div className="flex items-center justify-between gap-1 pt-1">
                        <button
                          type="button"
                          onClick={() => onGradeTuningChange?.({ ...gradeTuning, balance: -100 })}
                          className={`flex-1 py-1 rounded-md text-[9px] font-mono transition-colors cursor-pointer ${
                            balanceVal === -100
                              ? "bg-zinc-700 text-zinc-100 font-bold"
                              : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          -100 Sombras
                        </button>
                        <button
                          type="button"
                          onClick={() => onGradeTuningChange?.({ ...gradeTuning, balance: 0 })}
                          className={`flex-1 py-1 rounded-md text-[9px] font-mono transition-colors cursor-pointer ${
                            balanceVal === 0
                              ? "bg-zinc-700 text-zinc-100 font-bold"
                              : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          0 Neutro
                        </button>
                        <button
                          type="button"
                          onClick={() => onGradeTuningChange?.({ ...gradeTuning, balance: 100 })}
                          className={`flex-1 py-1 rounded-md text-[9px] font-mono transition-colors cursor-pointer ${
                            balanceVal === 100
                              ? "bg-zinc-700 text-zinc-100 font-bold"
                              : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          +100 Luzes
                        </button>
                      </div>
                    </div>

                    {/* Control 3: Protect Skin Tones Toggle */}
                    <div
                      onClick={handleToggleSkinProtection}
                      className="p-3 rounded-2xl bg-zinc-900/40 border border-zinc-800/60 flex items-center justify-between cursor-pointer hover:border-zinc-700 transition-colors"
                    >
                      <div className="space-y-0.5 pr-2">
                        <div className="flex items-center gap-1.5 font-medium text-[11px] text-zinc-200">
                          <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                          <span>{t("nav.gradeProtectSkin")}</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 leading-normal">
                          {t("nav.gradeProtectSkinHint")}
                        </p>
                      </div>
                      <div
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 ${
                          protectSkin ? "bg-blue-500" : "bg-zinc-700"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white transition-transform ${
                            protectSkin ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </div>
                    </div>

                    {/* Control 4: Exclude Neutrals Toggle */}
                    <div className="space-y-1.5">
                      <div
                        onClick={handleToggleExcludeNeutrals}
                        className="p-3 rounded-2xl bg-zinc-900/40 border border-zinc-800/60 flex items-center justify-between cursor-pointer hover:border-zinc-700 transition-colors"
                      >
                        <div className="space-y-0.5 pr-2">
                          <div className="flex items-center gap-1.5 font-medium text-[11px] text-zinc-200">
                            <Filter className="w-3.5 h-3.5 text-blue-400" />
                            <span>{t("nav.gradeExcludeNeutrals")}</span>
                          </div>
                          <p className="text-[10px] text-zinc-400 leading-normal">
                            {t("nav.gradeExcludeNeutralsHint")}
                          </p>
                        </div>
                        <div
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 ${
                            excludeNeutrals ? "bg-blue-500" : "bg-zinc-700"
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-white transition-transform ${
                              excludeNeutrals ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </div>
                      </div>

                      {/* Neutral Anchor Advisory Banner */}
                      {isNeutralAnchor && (
                        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2 text-amber-300 text-[10px] leading-snug">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <span>{t("nav.gradeAnchorNeutralWarning")}</span>
                        </div>
                      )}
                    </div>

                    {/* Advanced Extraction Parameters Drawer */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                        className="w-full flex items-center justify-between py-2 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <Palette className="w-3.5 h-3.5 text-zinc-400" />
                          {t("nav.gradeAdvancedSection")}
                        </span>
                        {isAdvancedOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      {isAdvancedOpen && (
                        <div className="space-y-3 pt-2 pb-1 animate-in fade-in-50 duration-200">
                          {/* Notice Box: Live Preview vs Library Re-index */}
                          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-200 text-[10px] flex items-start gap-2 leading-relaxed">
                            <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                            <span>{t("nav.gradeAdvancedPreviewNotice")}</span>
                          </div>

                          <div className="space-y-2 p-3 rounded-2xl bg-zinc-900/40 border border-zinc-800/60 text-[10px] text-zinc-400">
                            <div className="flex items-center justify-between">
                              <span>{t("nav.gradeShadowThreshold")}</span>
                              <span className="font-mono text-zinc-200">L* &le; 45</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>{t("nav.gradeHighlightThreshold")}</span>
                              <span className="font-mono text-zinc-200">L* &ge; 55</span>
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60">
                              <span>Banco de Dados:</span>
                              <span className="font-mono text-emerald-400">Dual Highlights (OK)</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* --- CASE B: COLOR MODE (5-Color Palette Breakdown) --- */}
                {anchorMode === "color" && (
                  <div className="space-y-3 pt-1 animate-in fade-in-50 duration-200">
                    <div className="p-3.5 rounded-2xl bg-zinc-900/50 border border-zinc-800/60 space-y-2.5">
                      <div className="flex items-center gap-1.5 text-zinc-200 font-semibold text-[11px]">
                        <Palette className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Paleta Dominante</span>
                      </div>

                      {/* 5-Color Swatch Bars */}
                      <div className="flex items-center gap-1.5 h-5 rounded-lg overflow-hidden p-0.5 bg-zinc-950/60 border border-zinc-800/80">
                        {anchorPalette.map((hex, i) => {
                          const w = Math.round((anchorWeights[i] || 1 / anchorPalette.length) * 100)
                          return (
                            <div
                              key={i}
                              className="h-full rounded-md transition-all relative group"
                              style={{ backgroundColor: hex, flex: Math.max(1, w) }}
                              title={`${hex} (${w}%)`}
                            />
                          )
                        })}
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        {anchorPalette.map((hex, i) => {
                          const w = Math.round((anchorWeights[i] || 1 / anchorPalette.length) * 100)
                          return (
                            <div key={i} className="flex items-center gap-1 text-[10px] font-mono text-zinc-400">
                              <span className="w-2.5 h-2.5 rounded-full border border-black/30" style={{ backgroundColor: hex }} />
                              <span>{hex}</span>
                              <span className="text-[9px] text-zinc-500">({w}%)</span>
                            </div>
                          )
                        })}
                      </div>

                      <p className="text-[11px] text-zinc-400 leading-normal pt-1 border-t border-zinc-800/60">
                        {t("nav.modeColorInfo")}
                      </p>

                      {onSelectAnchorMode && (
                        <button
                          type="button"
                          onClick={() => onSelectAnchorMode("grade")}
                          className="w-full mt-2 py-2 px-3 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-200 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>{t("nav.switchToGradeMode")}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* --- CASE C: HYBRID MODE (Multimodal Breakdown) --- */}
                {anchorMode === "hybrid" && (
                  <div className="space-y-3 pt-1 animate-in fade-in-50 duration-200">
                    <div className="p-3.5 rounded-2xl bg-zinc-900/50 border border-zinc-800/60 space-y-2.5">
                      <div className="flex items-center gap-1.5 text-zinc-200 font-semibold text-[11px]">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Composição Multimodal</span>
                      </div>

                      <div className="space-y-1.5 text-[10px]">
                        <div className="flex items-center justify-between text-zinc-400">
                          <span>Semântica Neural (CLIP):</span>
                          <span className="font-mono text-zinc-200 font-bold">68%</span>
                        </div>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-amber-400 h-full rounded-full" style={{ width: "68%" }} />
                        </div>

                        <div className="flex items-center justify-between text-zinc-400 pt-1">
                          <span>Harmonia de Paleta:</span>
                          <span className="font-mono text-zinc-200 font-bold">20%</span>
                        </div>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-emerald-400 h-full rounded-full" style={{ width: "20%" }} />
                        </div>

                        <div className="flex items-center justify-between text-zinc-400 pt-1">
                          <span>Tags & Proporção:</span>
                          <span className="font-mono text-zinc-200 font-bold">12%</span>
                        </div>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-blue-400 h-full rounded-full" style={{ width: "12%" }} />
                        </div>
                      </div>

                      <p className="text-[11px] text-zinc-400 leading-normal pt-1 border-t border-zinc-800/60">
                        {t("nav.modeHybridInfo")}
                      </p>

                      {onSelectAnchorMode && (
                        <button
                          type="button"
                          onClick={() => onSelectAnchorMode("grade")}
                          className="w-full mt-2 py-2 px-3 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-200 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>{t("nav.switchToGradeMode")}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* --- CASE D: VISUAL MODE (CLIP Neural Embeddings) --- */}
                {anchorMode === "visual" && (
                  <div className="space-y-3 pt-1 animate-in fade-in-50 duration-200">
                    <div className="p-3.5 rounded-2xl bg-zinc-900/50 border border-zinc-800/60 space-y-2.5">
                      <div className="flex items-center gap-1.5 text-zinc-200 font-semibold text-[11px]">
                        <Layers className="w-3.5 h-3.5 text-purple-400" />
                        <span>Embeddings Visuais (CLIP)</span>
                      </div>

                      <p className="text-[11px] text-zinc-400 leading-normal">
                        {t("nav.modeVisualInfo")}
                      </p>

                      <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-[10px] text-zinc-400 font-mono flex items-center justify-between">
                        <span>Modelo Neural:</span>
                        <span className="text-purple-300">ViT-B/32 (512-dim)</span>
                      </div>

                      {onSelectAnchorMode && (
                        <button
                          type="button"
                          onClick={() => onSelectAnchorMode("grade")}
                          className="w-full mt-2 py-2 px-3 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-200 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <span>{t("nav.switchToGradeMode")}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Footer / Library Summary */}
            <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500 font-mono">
              <span className="flex items-center gap-1.5">
                <FolderOpen className="w-3 h-3 text-zinc-400" />
                {currentLibraryName}
              </span>
              <span>
                {totalCount} {t("common.items").toLowerCase()}
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
})
