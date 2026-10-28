import * as React from "react"
import {
  Search,
  Image as ImageIcon,
  Sparkles,
  X,
  Layers,
  Eye,
  Palette,
  Loader2,
  UploadCloud,
  Link as LinkIcon,
  AlertCircle,
  FolderOpen,
  Film,
  CornerDownLeft,
  Sliders,
} from "lucide-react"
import { OmnimageLogo } from "./OmnimageLogo"
import { LibraryToggleSwitch } from "./LibraryToggleSwitch"
import { MultiColorPickerPopover, type ColorFilterPayload } from "./MultiColorPickerPopover"
import { TaxonomyPopover, type TaxonomyTab } from "./TaxonomyPopover"
import type { MediaTypeFilter } from "../core/mediaUtils"
import { MAX_FILTER_COLORS } from "../config/theme"
import type { CatalogFolderNode, CatalogTagFacet, CatalogTagGroup } from "../contracts/schemas"
export type EagleLibraryKey = string
import type { SimilaritySortMode } from "../services/similarityService"
import type { Artwork } from "../types/artwork"
import { queryVisualSearch } from "../services/visualSearchService"
import { parseSearchQuery, removeTagFromQuery } from "../core/tagFilter"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip"
import { cn } from "@/lib/utils"
import { useI18n } from "../i18n"

export type ActiveTab = 'canvas' | 'explore'

export interface FloatingNavProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  selectedColors: string[]
  onToggleColor: (color: string) => void
  onClearColors: () => void
  colorFilterMode?: 'OR' | 'AND'
  onColorFilterModeChange?: (mode: 'OR' | 'AND') => void
  onColorFilterChange?: (payload: ColorFilterPayload) => void
  maxColors?: number
  totalCount: number
  isEagleConnected?: boolean
  currentLibrary: EagleLibraryKey
  onSelectLibrary: (lib: EagleLibraryKey) => void
  isLoadingLibrary?: boolean
  colorAnchorArtwork?: Artwork | null
  onResetColorAnchor?: () => void
  anchorMode?: SimilaritySortMode
  onAnchorModeChange?: (mode: SimilaritySortMode) => void
  activeTab?: ActiveTab
  onSelectTab?: (tab: ActiveTab) => void
  onVisualSearch?: (artwork: Artwork) => void
  isVisualSearching?: boolean
  searchMode?: 'literal' | 'semantic'
  onSearchModeChange?: (mode: 'literal' | 'semantic') => void
  onSemanticSearch?: (query: string) => void
  isSemanticSearching?: boolean
  folders?: CatalogFolderNode[]
  selectedFolderId?: string | null
  onSelectFolder?: (folderId: string | null) => void
  tags?: CatalogTagFacet[]
  tagsGroups?: CatalogTagGroup[]
  mediaTypeFilter?: MediaTypeFilter
  onMediaTypeFilterChange?: (filter: MediaTypeFilter) => void
  videoCount?: number
  imageCount?: number
}

export const FloatingNav: React.FC<FloatingNavProps> = React.memo(({
  searchQuery,
  onSearchChange,
  selectedColors = [],
  onToggleColor,
  onClearColors,
  colorFilterMode = 'OR',
  onColorFilterModeChange,
  onColorFilterChange,
  maxColors = MAX_FILTER_COLORS,
  totalCount,
  isEagleConnected,
  currentLibrary,
  onSelectLibrary,
  isLoadingLibrary,
  colorAnchorArtwork,
  onResetColorAnchor,
  anchorMode = 'hybrid',
  onAnchorModeChange,
  activeTab = 'canvas',
  onSelectTab,
  onVisualSearch,
  isVisualSearching = false,
  searchMode = 'literal',
  onSearchModeChange,
  onSemanticSearch,
  isSemanticSearching = false,
  folders = [],
  selectedFolderId = null,
  onSelectFolder,
  tags = [],
  tagsGroups = [],
  mediaTypeFilter = 'all',
  onMediaTypeFilterChange,
  videoCount = 0,
  imageCount = 0,
}) => {
  const { t } = useI18n()

  const anchorModeOptions = React.useMemo(() => [
    {
      id: 'hybrid' as SimilaritySortMode,
      label: t('nav.modeHybrid'),
      hint: t('nav.modeHybridHint'),
      icon: Layers,
    },
    {
      id: 'visual' as SimilaritySortMode,
      label: t('nav.modeVisual'),
      hint: t('nav.modeVisualHint'),
      icon: Eye,
    },
    {
      id: 'color' as SimilaritySortMode,
      label: t('nav.modeColor'),
      hint: t('nav.modeColorHint'),
      icon: Palette,
    },
    {
      id: 'grade' as SimilaritySortMode,
      label: t('nav.modeGrade'),
      hint: t('nav.modeGradeHint'),
      icon: Sliders,
    },
  ], [t])
  const [isVisualSearchOpen, setIsVisualSearchOpen] = React.useState(false)
  const [isTaxonomyOpen, setIsTaxonomyOpen] = React.useState(false)
  const [taxonomyTab, setTaxonomyTab] = React.useState<TaxonomyTab>('folders')
  const [urlInput, setUrlInput] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [isDragOver, setIsDragOver] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const activeFolder = React.useMemo(() => {
    if (!selectedFolderId) return null
    function findRecursive(list: CatalogFolderNode[]): CatalogFolderNode | null {
      for (const item of list) {
        if (item.id === selectedFolderId) return item
        if (item.children?.length) {
          const found = findRecursive(item.children)
          if (found) return found
        }
      }
      return null
    }
    return findRecursive(folders)
  }, [folders, selectedFolderId])

  const activeFolderColor = activeFolder?.iconColor
    ? activeFolder.iconColor.startsWith('#')
      ? activeFolder.iconColor
      : activeFolder.iconColor === 'green'
      ? '#22c55e'
      : activeFolder.iconColor === 'blue'
      ? '#3b82f6'
      : '#f59e0b'
    : '#f59e0b'

  const handleProcessFile = React.useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setErrorMessage(t('nav.visualSearchInvalidFile'))
        return
      }
      setIsSubmitting(true)
      setErrorMessage(null)
      try {
        const { artwork } = await queryVisualSearch({ file })
        setIsVisualSearchOpen(false)
        onVisualSearch?.(artwork)
      } catch (err: any) {
        setErrorMessage(err?.message || 'Falha ao processar imagem.')
      } finally {
        setIsSubmitting(false)
      }
    },
    [onVisualSearch]
  )

  const handleFileInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        void handleProcessFile(file)
      }
      e.target.value = ''
    },
    [handleProcessFile]
  )

  const handleDropFile = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) {
        void handleProcessFile(file)
      }
    },
    [handleProcessFile]
  )

  const handleUrlSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const url = urlInput.trim()
      if (!url) return
      setIsSubmitting(true)
      setErrorMessage(null)
      try {
        const { artwork } = await queryVisualSearch({ url })
        setIsVisualSearchOpen(false)
        setUrlInput('')
        onVisualSearch?.(artwork)
      } catch (err: any) {
        setErrorMessage(err?.message || 'Falha ao processar URL da imagem.')
      } finally {
        setIsSubmitting(false)
      }
    },
    [urlInput, onVisualSearch]
  )

  const visibleChips = selectedColors.slice(0, 3)
  const extraChipCount = Math.max(0, selectedColors.length - 3)

  const handleFilterChange = React.useCallback(
    (payload: ColorFilterPayload) => {
      if (onColorFilterChange) {
        onColorFilterChange(payload)
        return
      }
      if (payload.mode !== colorFilterMode) {
        onColorFilterModeChange?.(payload.mode)
      }
      if (payload.colors.length === 0 && selectedColors.length > 0) {
        onClearColors()
      }
    },
    [onColorFilterChange, colorFilterMode, onColorFilterModeChange, selectedColors.length, onClearColors]
  )

  // Status checks for clean UI without clutter
  const isSemanticAnchorActive = Boolean(searchMode === 'semantic' && colorAnchorArtwork?.isTextQuery)
  const isAlreadySearched = Boolean(
    colorAnchorArtwork?.isTextQuery &&
    colorAnchorArtwork.title.trim().toLowerCase() === searchQuery.trim().toLowerCase()
  )
  const parsedQuery = React.useMemo(() => parseSearchQuery(searchQuery), [searchQuery])

  return (
    <TooltipProvider>
      <header className="fixed top-5 inset-x-0 z-40 flex items-center justify-between px-6 pointer-events-none">
        {/* Left Pill: Omnimage Identity + Connection Status Dot */}
        <div className="pointer-events-auto flex items-center gap-3 bg-zinc-950/80 backdrop-blur-xl border border-zinc-800/80 rounded-full px-4 py-1.5 shadow-2xl transition-all hover:border-zinc-700">
          <div className="relative flex items-center gap-2">
            <OmnimageLogo size={24} />
            <span className="text-xs font-semibold tracking-wider text-zinc-100 uppercase hidden sm:inline-block">
              Omnimage
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full animate-pulse cursor-help",
                    isEagleConnected ? "bg-blue-400" : "bg-amber-400"
                  )}
                />
              </TooltipTrigger>
              <TooltipContent>
                {isEagleConnected ? t("nav.catalogConnected", { count: totalCount.toLocaleString() }) : t("nav.connectingCatalog")}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="h-4 w-px bg-zinc-800 hidden sm:block" />
          <nav className="hidden md:flex items-center gap-1.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => onSelectTab?.('canvas')}
              className={
                activeTab === 'canvas'
                  ? "bg-zinc-800/90 text-white px-2.5 py-1 rounded-full transition-colors cursor-pointer"
                  : "text-zinc-400 hover:text-zinc-200 px-2.5 py-1 rounded-full transition-colors cursor-pointer"
              }
            >
              Gallery
            </button>
            <button
              type="button"
              onClick={() => onSelectTab?.('explore')}
              className={
                activeTab === 'explore'
                  ? "bg-zinc-800/90 text-white px-2.5 py-1 rounded-full transition-colors cursor-pointer"
                  : "text-zinc-400 hover:text-zinc-200 px-2.5 py-1 rounded-full transition-colors cursor-pointer"
              }
            >
              Explorar
            </button>
          </nav>
        </div>

        {/* Center Column: Global Search & Anchor Breadcrumb Trail */}
        <div className="flex flex-col items-center gap-2 w-full max-w-2xl mx-4 pointer-events-none">
          {/* Global Search & Smart Filter Pill */}
          <div
            className={cn(
              "pointer-events-auto flex items-center bg-zinc-950/85 backdrop-blur-2xl border rounded-full pl-2 pr-2 py-1.5 shadow-2xl transition-all duration-300 w-full",
              isSemanticAnchorActive
                ? "border-amber-500/40 shadow-[0_0_25px_rgba(245,158,11,0.14)] hover:border-amber-400/60"
                : "border-zinc-800 hover:border-zinc-700"
            )}
          >
            {/* Integrated Search Mode Toggle Icon (Literal vs CLIP IA) at Leading Edge */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    const newMode = searchMode === 'semantic' ? 'literal' : 'semantic'
                    onSearchModeChange?.(newMode)
                  }}
                  className={cn(
                    "w-7 h-7 flex items-center justify-center rounded-full transition-colors duration-150 mr-2 cursor-pointer shrink-0 select-none",
                    searchMode === 'semantic'
                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/35 shadow-xs hover:bg-amber-500/25 hover:border-amber-400/50"
                      : "bg-zinc-900/60 text-zinc-400 border border-zinc-800/80 hover:text-zinc-200 hover:bg-zinc-800/70 hover:border-zinc-700/80"
                  )}
                  aria-label={t("nav.searchModeToggleAria")}
                >
                  {searchMode === 'semantic' ? (
                    <Sparkles className="w-3.5 h-3.5" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {searchMode === "semantic" ? t("nav.searchModeSemanticActive") : t("nav.searchModeLiteralActive")}
              </TooltipContent>
            </Tooltip>

            {/* Active Folder Chip (Appears ONLY when a folder filter is active; clicking opens Folder tab) */}
            {activeFolder && (
              <div
                onClick={() => {
                  setTaxonomyTab('folders')
                  setIsTaxonomyOpen(true)
                }}
                className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/35 hover:border-amber-400/60 rounded-full pl-2 pr-1 py-0.5 text-xs text-amber-200 mr-1.5 shrink-0 shadow-xs cursor-pointer transition-colors"
                title={t("nav.filterFolderActive", { name: activeFolder.name })}
              >
                <FolderOpen
                  className="w-3 h-3 shrink-0"
                  style={{ color: activeFolderColor }}
                />
                <span className="max-w-[110px] truncate text-[11px] font-medium">
                  {activeFolder.name}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectFolder?.(null)
                  }}
                  className="p-0.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title={t("nav.clearFolderFilter")}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            )}

            {/* Active Media Type Filter Chip */}
            {mediaTypeFilter !== 'all' && (
              <div
                onClick={() => {
                  setTaxonomyTab('media')
                  setIsTaxonomyOpen(true)
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full pl-2 pr-1 py-0.5 text-xs mr-1.5 shrink-0 shadow-xs cursor-pointer transition-colors",
                  mediaTypeFilter === 'video'
                    ? "bg-amber-500/15 border border-amber-500/35 hover:border-amber-400/60 text-amber-200"
                    : "bg-sky-500/15 border border-sky-500/35 hover:border-sky-400/60 text-sky-200"
                )}
                title={mediaTypeFilter === "video" ? t("nav.filterVideosActive") : t("nav.filterImagesActive")}
              >
                {mediaTypeFilter === 'video' ? (
                  <Film className="w-3 h-3 text-amber-400 shrink-0" />
                ) : (
                  <ImageIcon className="w-3 h-3 text-sky-400 shrink-0" />
                )}
                <span className="text-[11px] font-medium">
                  {mediaTypeFilter === "video" ? t("nav.filterVideosBadge", { count: (videoCount ?? 0).toLocaleString() }) : t("nav.filterImagesBadge", { count: (imageCount ?? 0).toLocaleString() })}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMediaTypeFilterChange?.('all')
                  }}
                  className={cn(
                    "p-0.5 rounded-full hover:bg-white/20 transition-colors cursor-pointer",
                    mediaTypeFilter === 'video' ? "text-amber-300" : "text-sky-300"
                  )}
                  title={t("nav.clearMediaFilter")}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            )}

            {/* Active Chromatic / Image Anchor Badge (Rendered ONLY for Image anchors, avoiding text duplication) */}
            {colorAnchorArtwork && !colorAnchorArtwork.isTextQuery && (
              <div className="flex items-center gap-1.5 bg-zinc-900/90 border border-amber-500/30 rounded-full pl-2 pr-1.5 py-0.5 text-xs text-zinc-200 mr-1.5 shrink-0 shadow-sm animate-in fade-in duration-200">
                <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                <span
                  className="w-2.5 h-2.5 rounded-full border border-white/20 shrink-0"
                  style={{ backgroundColor: colorAnchorArtwork.dominantColor || '#ffffff' }}
                />
                <span className="max-w-[100px] truncate text-[11px] font-medium text-zinc-200">
                  {colorAnchorArtwork.title}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onResetColorAnchor?.()
                  }}
                  className="p-0.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors ml-0.5 cursor-pointer"
                  title={t("nav.restoreOriginalGrid")}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Active Tag Facets Chips (Included & Excluded) */}
            {(parsedQuery.includedTags.length > 0 || parsedQuery.excludedTags.length > 0) && (
              <div className="flex items-center gap-1 mr-1.5 shrink-0">
                {parsedQuery.includedTags.map((tag) => (
                  <span
                    key={`inc-${tag}`}
                    onClick={() => {
                      setTaxonomyTab('tags')
                      setIsTaxonomyOpen(true)
                    }}
                    className="inline-flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/35 hover:border-emerald-400/60 rounded-full pl-2 pr-1 py-0.5 text-[11px] font-medium text-emerald-300 shadow-xs cursor-pointer transition-colors"
                  >
                    <span>#{tag}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSearchChange(removeTagFromQuery(searchQuery, tag))
                      }}
                      className="text-emerald-400 hover:text-white rounded-full p-0.5 cursor-pointer leading-none"
                      title={t("nav.removeTagFilter", { tag })}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
                {parsedQuery.excludedTags.map((tag) => (
                  <span
                    key={`exc-${tag}`}
                    onClick={() => {
                      setTaxonomyTab('tags')
                      setIsTaxonomyOpen(true)
                    }}
                    className="inline-flex items-center gap-1 bg-rose-500/15 border border-rose-500/35 hover:border-rose-400/60 rounded-full pl-2 pr-1 py-0.5 text-[11px] font-medium text-rose-300 shadow-xs cursor-pointer transition-colors"
                  >
                    <span>-{tag}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSearchChange(removeTagFromQuery(searchQuery, tag))
                      }}
                      className="text-rose-400 hover:text-white rounded-full p-0.5 cursor-pointer leading-none"
                      title={t("nav.removeExcludeFilter", { tag })}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Selected Multi-Color Chips in Search Bar */}
            {selectedColors.length > 0 && (
              <div className="flex items-center gap-1 mr-1.5 shrink-0">
                {visibleChips.map((hex) => (
                  <span
                    key={hex}
                    className="inline-flex items-center gap-1 bg-zinc-900/90 border border-zinc-700/80 rounded-full pl-1.5 pr-1 py-0.5 text-[11px] font-mono text-zinc-200 shadow-sm"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-white/25 shrink-0"
                      style={{ backgroundColor: hex }}
                    />
                    <span className="hidden sm:inline text-[10px]">{hex.toUpperCase()}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleColor(hex)
                      }}
                      className="text-zinc-400 hover:text-white rounded-full p-0.5 transition-colors leading-none cursor-pointer"
                      title={t("nav.removeColorFilter", { hex })}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
                {extraChipCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-300 border border-zinc-700">
                    +{extraChipCount}
                  </span>
                )}
                {selectedColors.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onClearColors()
                    }}
                    className="p-0.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                    title={t("nav.clearAllColors")}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {/* Search Input Area */}
            <div className="relative flex-1 flex items-center min-w-0">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchMode === 'semantic' && searchQuery.trim()) {
                    e.preventDefault()
                    onSemanticSearch?.(searchQuery.trim())
                  }
                }}
                placeholder={
                  searchMode === 'semantic'
                    ? totalCount
                      ? t('nav.searchPlaceholderSemantic', { count: totalCount })
                      : t('nav.searchPlaceholderSemanticFallback')
                    : totalCount
                    ? t('nav.searchPlaceholderLiteral', { count: totalCount })
                    : t('nav.searchPlaceholderLiteralFallback')
                }
                className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none truncate"
              />

              {/* Spinner during embedding generation */}
              {isSemanticSearching && (
                <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin mr-1.5 shrink-0" />
              )}

              {/* Action button: ONLY appears when query is typed AND not yet searched */}
              {searchMode === 'semantic' && searchQuery.trim() && !isSemanticSearching && !isAlreadySearched && (
                <button
                  type="button"
                  onClick={() => onSemanticSearch?.(searchQuery.trim())}
                  className="hidden sm:inline-flex items-center gap-1 text-[11px] text-zinc-200 font-medium px-2 py-0.5 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-all cursor-pointer mr-1 shrink-0 animate-in fade-in"
                  title={t("nav.executeSemanticSearch")}
                >
                  <span>{t("common.search")}</span>
                  <CornerDownLeft className="w-3 h-3 text-zinc-400" />
                </button>
              )}

              {/* Unified Clear '?' Button (Clears input AND releases anchor if query was active) */}
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchChange("")
                    if (colorAnchorArtwork?.isTextQuery) {
                      onResetColorAnchor?.()
                    }
                  }}
                  className="text-zinc-500 hover:text-zinc-200 p-1 mr-1 transition-colors shrink-0 cursor-pointer"
                  title={t("nav.clearSearch")}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Trailing Action Triggers: [1] Visual Search (Input) | [2] Unified Taxonomy (Pastas + Tags) | [3] Color Picker */}
            <div className="flex items-center gap-0.5 shrink-0 ml-1">
              {/* 1. Visual Search Popover (Reverse Image Input) */}
              <Popover open={isVisualSearchOpen} onOpenChange={setIsVisualSearchOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "p-2 rounded-full hover:bg-zinc-800/60 active:scale-95 transition-all cursor-pointer",
                          isVisualSearching
                            ? "text-white bg-zinc-800 animate-pulse"
                            : "text-zinc-400 hover:text-zinc-100"
                        )}
                        aria-label={t("nav.visualSearchAria")}
                      >
                        <ImageIcon className="w-4 h-4" />
                      </button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>{t("nav.visualSearchTooltip")}</TooltipContent>
                </Tooltip>
                <PopoverContent
                  align="end"
                  sideOffset={10}
                  className="w-88 p-4 bg-zinc-950/95 border-zinc-800 backdrop-blur-2xl shadow-2xl rounded-2xl"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        {t("nav.visualSearchTitle")}
                      </h4>
                      <span className="text-[10px] text-zinc-500 font-mono">CLIP ViT-B/32</span>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      {t("nav.visualSearchDesc")}
                    </p>

                    {/* Dropzone */}
                    <div
                      onClick={() => !isSubmitting && fileInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault()
                        setIsDragOver(true)
                      }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={handleDropFile}
                      className={cn(
                        "border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer select-none",
                        isDragOver
                          ? "border-amber-400/80 bg-amber-500/10 scale-[1.01]"
                          : "border-zinc-800 hover:border-zinc-600 bg-zinc-900/40 hover:bg-zinc-900/70",
                        isSubmitting && "opacity-60 pointer-events-none"
                      )}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileInputChange}
                      />
                      {isSubmitting ? (
                        <div className="flex flex-col items-center justify-center py-2">
                          <Loader2 className="w-6 h-6 text-amber-400 animate-spin mb-2" />
                          <span className="text-xs font-medium text-zinc-200">{t("nav.visualSearchExtracting")}</span>
                          <span className="text-[10px] text-zinc-500 mt-0.5">{t("nav.visualSearchDimensions")}</span>
                        </div>
                      ) : (
                        <>
                          <UploadCloud className="w-7 h-7 text-zinc-500 mx-auto mb-1.5 transition-colors" />
                          <span className="text-xs font-medium text-zinc-300 block">
                            {t("nav.visualSearchDropHere")}
                          </span>
                          <span className="text-[10px] text-zinc-500 mt-1 block">
                            {t("nav.visualSearchFormats")}
                          </span>
                        </>
                      )}
                    </div>

                    {/* URL Input Form */}
                    <form onSubmit={handleUrlSubmit} className="space-y-1.5 pt-1">
                      <label className="text-[11px] font-medium text-zinc-400 flex items-center gap-1">
                        <LinkIcon className="w-3 h-3 text-zinc-500" />
                        {t("nav.visualSearchUrlLabel")}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="url"
                          placeholder={t("nav.visualSearchUrlPlaceholder")}
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                          disabled={isSubmitting}
                          className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 disabled:opacity-50"
                        />
                        <button
                          type="submit"
                          disabled={isSubmitting || !urlInput.trim()}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-200 text-zinc-950 hover:bg-white disabled:opacity-40 disabled:hover:bg-zinc-200 transition-all cursor-pointer"
                        >
                          Buscar
                        </button>
                      </div>
                    </form>

                    {/* Error Alert */}
                    {errorMessage && (
                      <div className="flex items-start gap-1.5 p-2 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-[11px] animate-in fade-in">
                        <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                        <span>{errorMessage}</span>
                      </div>
                    )}

                    <div className="pt-1 text-[10px] text-zinc-500 border-t border-zinc-900 flex items-center justify-between">
                      <span>{t("nav.visualSearchGlobalShortcut")}</span>
                      <span className="font-mono text-zinc-400">{t("nav.visualSearchGlobalShortcutDesc")}</span>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <div className="h-4 w-px bg-zinc-800/80 mx-0.5" />

              {/* 2. Unified Taxonomy Filter Popover (Pastas + Smart Tags + Mídia) */}
              <TaxonomyPopover
                folders={folders}
                selectedFolderId={selectedFolderId || null}
                onSelectFolder={onSelectFolder || (() => {})}
                tags={tags}
                tagsGroups={tagsGroups}
                searchQuery={searchQuery}
                onSearchQueryChange={onSearchChange}
                totalCount={totalCount}
                libraryLabel={currentLibrary === 'google-flow' ? 'Prompts' : 'Design'}
                open={isTaxonomyOpen}
                onOpenChange={setIsTaxonomyOpen}
                activeTab={taxonomyTab}
                onActiveTabChange={setTaxonomyTab}
                mediaTypeFilter={mediaTypeFilter}
                onMediaTypeFilterChange={onMediaTypeFilterChange}
                videoCount={videoCount}
                imageCount={imageCount}
              />

              {/* 3. Continuous 2D Multi-Color Palette Filter Popover */}
              <MultiColorPickerPopover
                selectedColors={selectedColors}
                filterMode={colorFilterMode}
                maxColors={maxColors}
                onFilterChange={handleFilterChange}
              />
            </div>
          </div>

          {/* Mode Selector when in Color Anchor Mode */}
          {colorAnchorArtwork && activeTab === 'canvas' && (
            <div className="pointer-events-auto flex items-center gap-1.5 p-1 rounded-full bg-zinc-950/90 backdrop-blur-2xl border border-zinc-800/90 shadow-2xl animate-in fade-in slide-in-from-top-1 duration-200">
              {colorAnchorArtwork.isTextQuery ? (
                <span className="text-[11px] font-medium text-amber-400 pl-2.5 pr-1 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span className="hidden sm:inline">{t("nav.anchorAiSearch")}</span>
                </span>
              ) : colorAnchorArtwork.isEphemeral ? (
                <span className="text-[11px] font-medium text-amber-400 pl-2.5 pr-1 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span className="hidden sm:inline">{t("nav.anchorVisualSearch")}</span>
                </span>
              ) : (
                <span className="text-[11px] font-medium text-zinc-400 pl-2.5 pr-1 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span className="hidden sm:inline">{t("nav.anchorHarmonization")}</span>
                </span>
              )}
              {anchorModeOptions.map((opt) => {
                const Icon = opt.icon
                const isActive = anchorMode === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onAnchorModeChange?.(opt.id)}
                    title={opt.hint}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer",
                      isActive
                        ? "bg-zinc-100 text-zinc-950 shadow-xs font-semibold"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{opt.label}</span>
                  </button>
                )
              })}

              {onResetColorAnchor && (
                <button
                  type="button"
                  onClick={onResetColorAnchor}
                  className="p-1 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 transition-colors ml-0.5 cursor-pointer"
                  title={t("nav.unpinAnchor")}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Switch: Library Switcher */}
        <LibraryToggleSwitch
          currentLibrary={currentLibrary}
          onSelectLibrary={onSelectLibrary}
          isLoading={isLoadingLibrary}
        />
      </header>
    </TooltipProvider>
  )
})

