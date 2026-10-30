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
  LayoutGrid,
  Zap,
  Cpu,
  Check,
} from "lucide-react"
import { cn } from "../lib/utils"
import { useI18n } from "../i18n"
import type { Artwork } from "../types/artwork"
import type { GradeTuningOptions } from "../core/colorClustering"
import type { LayoutTuningOptions } from "../core/layoutExtractor"
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
  layoutTuning?: LayoutTuningOptions
  onLayoutTuningChange?: (tuning: LayoutTuningOptions) => void
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
  layoutTuning,
  onLayoutTuningChange,
  isOpen,
  onToggleOpen,
}) => {
  const { t } = useI18n()
  const [activeEngine, setActiveEngine] = React.useState<'clip-vit-b32' | 'embeddinggemma-2'>('clip-vit-b32')
  const [isSwitchingEngine, setIsSwitchingEngine] = React.useState(false)
  const [engineSwitchError, setEngineSwitchError] = React.useState<string | null>(null)

  React.useEffect(() => {
    fetch('/api/catalog/embedding-config')
      .then((res) => res.json())
      .then((res) => {
        if (res.status === 'success' && res.data?.engine) {
          if (res.data.engine === 'clip-vit-b32' || res.data.engine === 'embeddinggemma-2') {
            setActiveEngine(res.data.engine)
          }
        }
      })
      .catch(() => {})
  }, [isOpen])

  const handleSelectEngineInCard = async (engine: 'clip-vit-b32' | 'embeddinggemma-2') => {
    if (engine === activeEngine || isSwitchingEngine) return
    setIsSwitchingEngine(true)
    setEngineSwitchError(null)
    try {
      const res = await fetch('/api/catalog/embedding-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine,
          device: engine === 'embeddinggemma-2' ? 'directml' : 'auto',
        }),
      })
      if (res.ok) {
        const json = await res.json().catch(() => null)
        if (json?.status === 'success') {
          setActiveEngine(engine)
          // Reload page or let parent know to re-fetch embeddings binary
          window.location.reload()
          return
        }
      }
      setEngineSwitchError(t("nav.engineSwitchError") || 'Falha ao alternar motor neural.')
    } catch (err) {
      setEngineSwitchError(err instanceof Error ? err.message : 'Falha na conexão.')
    } finally {
      setIsSwitchingEngine(false)
    }
  }
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
  const isLayoutMode = anchorMode === "layout"

  // Current tuning values with defaults
  const sensitivityPct = Math.round((gradeTuning?.sensitivity ?? 0.75) * 100)
  const balanceVal = gradeTuning?.balance ?? 0
  const protectSkin = gradeTuning?.protectSkinTones !== false
  const excludeNeutrals = Boolean(gradeTuning?.excludeNeutrals)

  // Layout tuning values with defaults
  const aspectWeightPct = Math.round((layoutTuning?.aspectWeight ?? 0.15) * 100)
  const layoutSensitivity = layoutTuning?.sensitivity ?? 1.0
  const layoutSensitivityPct = Math.round(layoutSensitivity * 100)
  const hasLayoutOverride = Boolean(aspectWeightPct !== 15 || layoutSensitivityPct !== 100)

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

  const handleAspectWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    onLayoutTuningChange?.({
      ...layoutTuning,
      aspectWeight: val / 100,
    })
  }

  const handleLayoutSensitivityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    onLayoutTuningChange?.({
      ...layoutTuning,
      sensitivity: val / 100,
    })
  }

  const handleResetLayoutTuning = () => {
    onLayoutTuningChange?.({
      aspectWeight: 0.15,
      sensitivity: 1.0,
    })
  }

  // Anchor palette with weights for 'color' mode preview
  const anchorPalette = anchorArtwork?.palette || (anchorArtwork?.dominantColor ? [anchorArtwork.dominantColor] : [])
  const anchorWeights = anchorArtwork?.paletteWeights || anchorPalette.map(() => 1 / Math.max(1, anchorPalette.length))

  return (
    <aside className="fixed bottom-6 left-6 z-30 pointer-events-none w-88 sm:w-96 max-w-[calc(100vw-3rem)] select-none">
      <div
        className="pointer-events-auto bg-zinc-950/95 border rounded-2xl overflow-hidden shadow-2xl transition-colors duration-200 flex flex-col max-h-[calc(100vh-6rem)]"
        style={
          anchorArtwork
            ? {
                borderColor: "var(--anchor-accent-subtle)",
                boxShadow: "0 12px 36px -10px var(--anchor-accent-subtle), 0 20px 25px -5px rgba(0, 0, 0, 0.5)",
              }
            : {
                borderColor: "rgba(39, 39, 42, 0.8)",
              }
        }
      >
        {/* Card Header */}
        <div className="p-4 flex items-center justify-between border-b border-zinc-800/60 bg-zinc-900/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-zinc-800/80 border border-zinc-700/60 rounded-full px-2.5 py-1 flex items-center gap-1.5 shadow-xs">
              <span
                className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                  !anchorArtwork
                    ? isEagleConnected
                      ? "bg-blue-400"
                      : "bg-amber-400 animate-pulse"
                    : ""
                }`}
                style={
                  anchorArtwork
                    ? { backgroundColor: "var(--anchor-accent)" }
                    : undefined
                }
              />
              <span className="text-[11px] font-bold tracking-wider text-zinc-100 uppercase">
                {anchorArtwork ? t("nav.searchSettingsTitle") : isEagleConnected ? "Gallery" : t("infoCard.loadingTitle")}
              </span>
            </div>
            {anchorArtwork && ((isGradeMode && hasAnyOverride) || (isLayoutMode && hasLayoutOverride)) && (
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse transition-colors duration-300"
                style={{ backgroundColor: "var(--anchor-accent)" }}
                title="Tuning active"
              />
            )}
            
          </div>

          <div className="flex items-center gap-1">
            {anchorArtwork && ((isGradeMode && hasAnyOverride) || (isLayoutMode && hasLayoutOverride)) && isExpanded && (
              <button
                type="button"
                onClick={isGradeMode ? handleResetTuning : handleResetLayoutTuning}
                className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                title={isGradeMode ? t("nav.gradeResetTuning") : t("nav.layoutResetTuning")}
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
                <div className="p-3.5 rounded-xl bg-zinc-900/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                      {t("infoCard.connectedTitle")}
                    </span>
                    <span className="text-[11px] text-blue-400 font-medium tabular-nums">
                      {totalCount} {t("common.items").toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    {t("infoCard.viewingLibrary", { name: currentLibraryName })}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-zinc-900/40 flex items-start gap-2.5 text-zinc-400">
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
                <div className="p-2.5 rounded-xl bg-zinc-900/50 flex items-center gap-3">
                  <img
                    src={anchorArtwork.thumbnailUrl || anchorArtwork.imageUrl}
                    alt={anchorArtwork.title}
                    className="w-10 h-10 rounded-xl object-cover border border-zinc-700/60 shrink-0 bg-zinc-800"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-zinc-100 truncate text-[11px]">
                        {anchorArtwork.title || "Anchor Reference"}
                      </span>
                      <span
                        className="text-[9px] font-medium px-1.5 py-0.5 rounded-md uppercase font-bold transition-colors duration-300"
                        style={{
                          backgroundColor: "var(--anchor-accent-subtle)",
                          color: "var(--anchor-accent-bright)",
                          borderColor: "var(--anchor-accent-subtle)",
                          borderWidth: 1,
                          borderStyle: "solid",
                        }}
                      >
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
                        <span className="text-[10px] text-zinc-400 font-medium truncate">
                          {shadowHex} / {highlightHex}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Mode Selector Pill Row */}
                {onSelectAnchorMode && (
                  <div className="flex items-center gap-1 p-1 bg-zinc-900/60 rounded-xl">
                    {(["grade", "hybrid", "color", "visual", "layout"] as SimilaritySortMode[]).map((m) => {
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
                      
                    </div>

                    {/* Control 1: Grade Sensitivity Slider */}
                    <div className="space-y-1.5 p-3 rounded-xl bg-zinc-900/40">
                      <div className="flex items-center justify-between text-zinc-300">
                        <span className="font-medium text-[11px]">{t("nav.gradeSensitivity")}</span>
                        <span
                          className="font-medium tabular-nums text-[11px] font-bold transition-colors duration-300"
                          style={{ color: "var(--anchor-accent-bright)" }}
                        >
                          {sensitivityPct}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={sensitivityPct}
                        onChange={handleSensitivityChange}
                        style={{ accentColor: "var(--anchor-accent)" }}
                        className="w-full h-1.5 bg-zinc-800 rounded-lg cursor-pointer transition-colors duration-300"
                      />
                      <div className="flex items-center justify-between text-[10px] text-zinc-400 font-medium">
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
                    <div className="space-y-2 p-3 rounded-xl bg-zinc-900/40">
                      <div className="flex items-center justify-between text-zinc-300">
                        <span className="font-medium text-[11px]">{t("nav.gradeBalance")}</span>
                        <span className="font-medium tabular-nums text-[11px] text-zinc-300">
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
                        style={{ accentColor: "var(--anchor-accent)" }}
                        className="w-full h-1.5 bg-zinc-800 rounded-lg cursor-pointer transition-colors duration-300"
                      />
                      <div className="flex items-center justify-between gap-1 pt-1">
                        <button
                          type="button"
                          onClick={() => onGradeTuningChange?.({ ...gradeTuning, balance: -100 })}
                          className={`flex-1 py-1 rounded-md text-[9px] font-medium transition-colors cursor-pointer ${
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
                          className={`flex-1 py-1 rounded-md text-[9px] font-medium transition-colors cursor-pointer ${
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
                          className={`flex-1 py-1 rounded-md text-[9px] font-medium transition-colors cursor-pointer ${
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
                      className="p-3 rounded-xl bg-zinc-900/40 flex items-center justify-between cursor-pointer hover:border-zinc-700 transition-colors"
                    >
                      <div className="space-y-0.5 pr-2">
                        <div className="flex items-center gap-1.5 font-medium text-[11px] text-zinc-200">
                          <ShieldCheck
                            className="w-3.5 h-3.5 transition-colors duration-300"
                            style={{ color: "var(--anchor-accent)" }}
                          />
                          <span>{t("nav.gradeProtectSkin")}</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 leading-normal">
                          {t("nav.gradeProtectSkinHint")}
                        </p>
                      </div>
                      <div
                        className="w-9 h-5 rounded-full p-0.5 transition-all duration-300 shrink-0"
                        style={{
                          backgroundColor: protectSkin ? "var(--anchor-accent)" : "#3f3f46",
                          boxShadow: protectSkin ? "0 0 10px -2px var(--anchor-accent-subtle)" : undefined,
                        }}
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
                        className="p-3 rounded-xl bg-zinc-900/40 flex items-center justify-between cursor-pointer hover:border-zinc-700 transition-colors"
                      >
                        <div className="space-y-0.5 pr-2">
                          <div className="flex items-center gap-1.5 font-medium text-[11px] text-zinc-200">
                            <Filter
                              className="w-3.5 h-3.5 transition-colors duration-300"
                              style={{ color: "var(--anchor-accent)" }}
                            />
                            <span>{t("nav.gradeExcludeNeutrals")}</span>
                          </div>
                          <p className="text-[10px] text-zinc-400 leading-normal">
                            {t("nav.gradeExcludeNeutralsHint")}
                          </p>
                        </div>
                        <div
                          className="w-9 h-5 rounded-full p-0.5 transition-all duration-300 shrink-0"
                          style={{
                            backgroundColor: excludeNeutrals ? "var(--anchor-accent)" : "#3f3f46",
                            boxShadow: excludeNeutrals ? "0 0 10px -2px var(--anchor-accent-subtle)" : undefined,
                          }}
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
                        <div className="p-2.5 rounded-xl bg-amber-500/10 flex items-start gap-2 text-amber-300 text-[10px] leading-snug">
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
                          <div
                            className="p-2.5 rounded-lg text-[10px] flex items-start gap-2 leading-relaxed transition-colors duration-300"
                            style={{
                              backgroundColor: "var(--anchor-accent-subtle)",
                              borderLeft: "2px solid var(--anchor-accent)",
                              color: "var(--anchor-accent-bright)",
                            }}
                          >
                            <Info
                              className="w-3.5 h-3.5 shrink-0 mt-0.5"
                              style={{ color: "var(--anchor-accent)" }}
                            />
                            <span>{t("nav.gradeAdvancedPreviewNotice")}</span>
                          </div>

                          <div className="space-y-2 p-3 rounded-xl bg-zinc-900/40 text-[10px] text-zinc-400">
                            <div className="flex items-center justify-between">
                              <span>{t("nav.gradeShadowThreshold")}</span>
                              <span className="font-medium tabular-nums text-zinc-200">L* &le; 45</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>{t("nav.gradeHighlightThreshold")}</span>
                              <span className="font-medium tabular-nums text-zinc-200">L* &ge; 55</span>
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60">
                              <span>Banco de Dados:</span>
                              <span className="font-medium text-emerald-400">Dual Highlights (OK)</span>
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
                    <div className="p-3.5 rounded-xl bg-zinc-900/50 space-y-2.5">
                      <div className="flex items-center gap-1.5 text-zinc-200 font-semibold text-[11px]">
                        <Palette className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Paleta Dominante</span>
                      </div>

                      {/* 5-Color Swatch Bars */}
                      <div className="flex items-center gap-1.5 h-5 rounded-lg overflow-hidden p-0.5 bg-zinc-900/40">
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
                            <div key={i} className="flex items-center gap-1 text-[10px] text-zinc-400 font-medium tabular-nums">
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
                          className="w-full mt-2 py-2 px-3 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-200 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-transparent hover:border-[var(--anchor-accent-subtle)]"
                        >
                          <span>{t("nav.switchToGradeMode")}</span>
                          <ArrowRight
                            className="w-3.5 h-3.5 transition-colors duration-300"
                            style={{ color: "var(--anchor-accent-bright)" }}
                          />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* --- CASE C: HYBRID MODE (Multimodal Breakdown) --- */}
                {anchorMode === "hybrid" && (
                  <div className="space-y-3 pt-1 animate-in fade-in-50 duration-200">
                    <div className="p-3.5 rounded-xl bg-zinc-900/50 space-y-2.5">
                      <div className="flex items-center gap-1.5 text-zinc-200 font-semibold text-[11px]">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Composição Multimodal</span>
                      </div>

                      <div className="space-y-1.5 text-[10px]">
                        <div className="flex items-center justify-between text-zinc-400">
                          <span>Semântica Neural (CLIP):</span>
                          <span className="font-medium tabular-nums text-zinc-200 font-bold">68%</span>
                        </div>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-amber-400 h-full rounded-full" style={{ width: "68%" }} />
                        </div>

                        <div className="flex items-center justify-between text-zinc-400 pt-1">
                          <span>Harmonia de Paleta:</span>
                          <span className="font-medium tabular-nums text-zinc-200 font-bold">20%</span>
                        </div>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-emerald-400 h-full rounded-full" style={{ width: "20%" }} />
                        </div>

                        <div className="flex items-center justify-between text-zinc-400 pt-1">
                          <span>Tags & Proporção:</span>
                          <span className="font-medium tabular-nums text-zinc-200 font-bold">12%</span>
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
                          className="w-full mt-2 py-2 px-3 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-200 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-transparent hover:border-[var(--anchor-accent-subtle)]"
                        >
                          <span>{t("nav.switchToGradeMode")}</span>
                          <ArrowRight
                            className="w-3.5 h-3.5 transition-colors duration-300"
                            style={{ color: "var(--anchor-accent-bright)" }}
                          />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* --- CASE D: VISUAL MODE (Neural Embeddings: CLIP or Gemma 2) --- */}
                {anchorMode === "visual" && (
                  <div className="space-y-3 pt-1 animate-in fade-in-50 duration-200">
                    <div className="p-3.5 rounded-xl bg-zinc-900/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-zinc-200 font-semibold text-[11px]">
                          <Layers className="w-3.5 h-3.5 text-purple-400" />
                          <span>{t("nav.modeVisualTitle")}</span>
                        </div>
                        
                      </div>

                      <p className="text-[11px] text-zinc-400 leading-normal">
                        {t("nav.modeVisualSubtitle")}
                      </p>

                      {engineSwitchError && (
                        <div className="p-2 rounded-lg bg-red-500/10 text-[11px] text-red-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          <span>{engineSwitchError}</span>
                        </div>
                      )}

                      {/* Model Selector Pills */}
                      <div className="space-y-1.5">
                        <div className="text-[10px] text-zinc-400 font-medium">{t("nav.neuralEngineActive")}</div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={isSwitchingEngine}
                            onClick={() => handleSelectEngineInCard('clip-vit-b32')}
                            className={cn(
                              "p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1",
                              activeEngine === 'clip-vit-b32'
                                ? "bg-zinc-900 border-cyan-500/60 text-white shadow-sm"
                                : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold flex items-center gap-1">
                                <Zap className="w-3 h-3 text-amber-400" />
                                CLIP ViT-B/32
                              </span>
                              {activeEngine === 'clip-vit-b32' && <Check className="w-3 h-3 text-cyan-400" />}
                            </div>
                            <span className="text-[9px] text-zinc-500">{t("nav.neuralEngineClipDesc")}</span>
                          </button>

                          <button
                            type="button"
                            disabled={isSwitchingEngine}
                            onClick={() => handleSelectEngineInCard('embeddinggemma-2')}
                            className={cn(
                              "p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1",
                              activeEngine === 'embeddinggemma-2'
                                ? "bg-zinc-900 border-purple-500/60 text-white shadow-sm"
                                : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold flex items-center gap-1">
                                <Cpu className="w-3 h-3 text-purple-400" />
                                Gemma 2
                              </span>
                              {activeEngine === 'embeddinggemma-2' && <Check className="w-3 h-3 text-purple-400" />}
                            </div>
                            <span className="text-[9px] text-purple-300">{t("nav.neuralEngineGemmaDesc")}</span>
                          </button>
                        </div>
                      </div>

                      {activeEngine === 'embeddinggemma-2' ? (
                        <div className="p-2.5 rounded-xl bg-purple-950/20 text-[10px] text-purple-300 flex items-center justify-between">
                          <span>{t("nav.neuralIndexLabel")}</span>
                          <span className="font-bold">embeddings.gemma2.bin</span>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-zinc-900/40 text-[10px] text-zinc-400 flex items-center justify-between">
                          <span>{t("nav.neuralIndexLabel")}</span>
                          <span>embeddings.bin</span>
                        </div>
                      )}

                      {onSelectAnchorMode && (
                        <button
                          type="button"
                          onClick={() => onSelectAnchorMode("grade")}
                          className="w-full mt-2 py-2 px-3 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-200 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-transparent hover:border-[var(--anchor-accent-subtle)]"
                        >
                          <span>{t("nav.switchToGradeMode")}</span>
                          <ArrowRight
                            className="w-3.5 h-3.5 transition-colors duration-300"
                            style={{ color: "var(--anchor-accent-bright)" }}
                          />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* --- CASE E: LAYOUT MODE (Spatial Wireframe & Composition) --- */}
                {anchorMode === "layout" && (
                  <div className="space-y-3 pt-1 animate-in fade-in-50 duration-200">
                    <div className="p-3.5 rounded-xl bg-zinc-900/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-zinc-200 font-semibold text-[11px]">
                          <LayoutGrid className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{t("nav.layoutWireframeTitle")}</span>
                        </div>
                        
                      </div>

                      {/* Control 1: Aspect Ratio Cohesion Slider */}
                      <div className="space-y-1.5 p-3 rounded-xl bg-zinc-900/40">
                        <div className="flex items-center justify-between text-zinc-300">
                          <span className="font-medium text-[11px]">{t("nav.layoutAspectWeight")}</span>
                          <span
                            className="font-medium tabular-nums text-[11px] font-bold transition-colors duration-300"
                            style={{ color: "var(--anchor-accent-bright)" }}
                          >
                            {aspectWeightPct}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="50"
                          step="1"
                          value={aspectWeightPct}
                          onChange={handleAspectWeightChange}
                          style={{ accentColor: "var(--anchor-accent)" }}
                          className="w-full h-1.5 bg-zinc-800 rounded-lg cursor-pointer transition-colors duration-300"
                        />
                        <div className="flex items-center justify-between text-[10px] text-zinc-400 font-medium">
                          <span>Livre (0%)</span>
                          <span className="text-[9px] text-zinc-400">
                            {aspectWeightPct === 0 ? "Apenas disposição espacial" : aspectWeightPct > 30 ? "Mesmo aspect ratio estrito" : "Equilibrado"}
                          </span>
                          <span>Estrito (50%)</span>
                        </div>
                      </div>

                      {/* Control 2: Layout Sensitivity Slider */}
                      <div className="space-y-1.5 p-3 rounded-xl bg-zinc-900/40">
                        <div className="flex items-center justify-between text-zinc-300">
                          <span className="font-medium text-[11px]">{t("nav.layoutSensitivity")}</span>
                          <span
                            className="font-medium tabular-nums text-[11px] font-bold transition-colors duration-300"
                            style={{ color: "var(--anchor-accent-bright)" }}
                          >
                            {layoutSensitivityPct}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="50"
                          max="250"
                          step="5"
                          value={layoutSensitivityPct}
                          onChange={handleLayoutSensitivityChange}
                          style={{ accentColor: "var(--anchor-accent)" }}
                          className="w-full h-1.5 bg-zinc-800 rounded-lg cursor-pointer transition-colors duration-300"
                        />
                        <div className="flex items-center justify-between text-[10px] text-zinc-400 font-medium">
                          <span>Suave</span>
                          <span className="text-[9px] text-zinc-400">
                            {layoutSensitivityPct < 80 ? "Tolera variações" : layoutSensitivityPct > 150 ? "Exigente" : "Curva linear"}
                          </span>
                          <span>Exigente</span>
                        </div>
                      </div>

                      {/* Feature Breakdown Badges */}
                      <div className="space-y-1.5 text-[10px]">
                        <div className="flex items-center justify-between text-zinc-400">
                          <span>Grade Espacial 16×9 (Massa + Bordas):</span>
                          <span className="font-medium tabular-nums text-zinc-200 font-bold">{100 - aspectWeightPct}%</span>
                        </div>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-cyan-400 h-full rounded-full transition-all" style={{ width: `${100 - aspectWeightPct}%` }} />
                        </div>

                        <div className="flex items-center justify-between text-zinc-400 pt-1">
                          <span>Coesão de Proporção (Aspect):</span>
                          <span className="font-medium tabular-nums text-zinc-200 font-bold">{aspectWeightPct}%</span>
                        </div>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-blue-400 h-full rounded-full transition-all" style={{ width: `${aspectWeightPct}%` }} />
                        </div>
                      </div>

                      {/* Info note */}
                      <div className="p-2.5 rounded-xl bg-zinc-900/40 space-y-1">
                        <div className="flex items-center gap-1.5 text-zinc-300 text-[10px] font-semibold">
                          <ShieldCheck className="w-3 h-3 text-cyan-400" />
                          <span>Invariante a Tema & Ruído</span>
                        </div>
                        <p className="text-[10px] text-zinc-400 leading-normal">
                          {t("nav.modeLayoutInfo")}
                        </p>
                      </div>

                      {onSelectAnchorMode && (
                        <button
                          type="button"
                          onClick={() => onSelectAnchorMode("grade")}
                          className="w-full mt-2 py-2 px-3 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-200 text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-transparent hover:border-[var(--anchor-accent-subtle)]"
                        >
                          <span>{t("nav.switchToGradeMode")}</span>
                          <ArrowRight
                            className="w-3.5 h-3.5 transition-colors duration-300"
                            style={{ color: "var(--anchor-accent-bright)" }}
                          />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Footer / Library Summary */}
            <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-400 font-medium">
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
