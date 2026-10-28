import * as React from "react"
import { useInfiniteCanvas } from "../hooks/useInfiniteCanvas"
import { useColorSortWorker } from "../hooks/useColorSortWorker"
import { useCatalogLoader as useLibraryLoader } from "../hooks/useCatalogLoader"
import { useRecentArtworks } from "../hooks/useRecentArtworks"
import { useAnchorTrail } from "../hooks/useAnchorTrail"
import type { Artwork } from "../types/artwork"
import { getCatalogProvider } from "../providers/providerFactory"
import type {
  CatalogTaxonomyResponse,
  CatalogFolderNode,
} from "../contracts/schemas"
export type EagleLibraryKey = string
const fetchCatalogTaxonomy = (lib: string, refresh = false) => getCatalogProvider().fetchTaxonomy(lib, refresh)
import { parseSearchQuery, matchesTagFilters } from "../core/tagFilter"
import type { SimilaritySortMode } from "../services/similarityService"
import type { GradeTuningOptions } from "../core/colorClustering"
import {
  buildInfiniteGridModel,
  getVisibleVirtualCards,
  getHarmonizedVirtualCards,
  findArtworkWorldPosition,
  GRID_SIZE_PRESETS,
  type GridSizeMode,
} from "../core/infiniteGrid"
import {
  matchesColorFilter,
  type ColorFilterMode,
} from "../core/colorClustering"
import { calibrateAnchorAccent } from "../core/colorConversion"
import { isVideoArtwork, type MediaTypeFilter } from "../core/mediaUtils"
import { ArtworkCard } from "./ArtworkCard"
import { FloatingNav, type ActiveTab } from "./FloatingNav"
import { MAX_FILTER_COLORS } from "../config/theme"
import { FloatingInfoCard } from "./FloatingInfoCard"
import { CanvasControls } from "./CanvasControls"
import { ExploreFeedView } from "./ExploreFeedView"
import { ExploreFullscreenViewer } from "./ExploreFullscreenViewer"
import { RecentlyViewedDock } from "./RecentlyViewedDock"
import { ShortcutsModal } from "./ShortcutsModal"
import { OmnimageLogo } from "./OmnimageLogo"
import { queryVisualSearch } from "../services/visualSearchService"
import { querySemanticSearch } from "../services/semanticSearchService"
import { Sparkles, Loader2, AlertCircle, UploadCloud, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useI18n } from "../i18n"

export const InfiniteCanvas: React.FC = () => {
  const { t } = useI18n()

  // Active View Tab: 'canvas' (2D Infinite Spatial Grid) or 'explore' (Vertical Scroll + Fullscreen Eagle Inspector)
  const [activeTab, setActiveTab] = React.useState<ActiveTab>('canvas')

  // Grid Density Size: 'small' | 'default' | 'large'
  const [gridSize, setGridSize] = React.useState<GridSizeMode>('default')
  const gridPreset = GRID_SIZE_PRESETS[gridSize]

  // Library switch state: 'design' or 'google-flow'
  const [currentLibrary, setCurrentLibrary] = React.useState<EagleLibraryKey>('design')

  // Folders & Tag Facets state
  const [selectedFolderId, setSelectedFolderId] = React.useState<string | null>(null)
  const [foldersData, setFoldersData] = React.useState<CatalogTaxonomyResponse | null>(null)
  const [, setIsLoadingFolders] = React.useState(false)

  // Search & Multi-Color Filter state
  const [searchQuery, setSearchQuery] = React.useState("")
  const [searchMode, setSearchMode] = React.useState<'literal' | 'semantic'>('literal')
  const [isSemanticSearching, setIsSemanticSearching] = React.useState(false)
  const [semanticSearchError, setSemanticSearchError] = React.useState<string | null>(null)
  const [selectedColors, setSelectedColors] = React.useState<string[]>([])
  const [colorFilterMode, setColorFilterMode] = React.useState<ColorFilterMode>('OR')
  const [mediaTypeFilter, setMediaTypeFilter] = React.useState<MediaTypeFilter>('all')

  // Active anchor artwork & similarity mode ('hybrid' | 'visual' | 'color' | 'grade') for radial reorganization in Canvas mode
  const [colorAnchorArtwork, setColorAnchorArtwork] = React.useState<Artwork | null>(null)
  const [anchorMode, setAnchorMode] = React.useState<SimilaritySortMode>('hybrid')
  const [gradeTuning, setGradeTuning] = React.useState<GradeTuningOptions>({
    balance: 0,
    sensitivity: 0.75,
    protectSkinTones: true,
    excludeNeutrals: false,
  })
  const [isSearchSettingsOpen, setIsSearchSettingsOpen] = React.useState(true)

  // Anchor Breadcrumb Trail (Rabbit Hole navigation)
  const {
    trail: anchorTrail,
    currentIndex: anchorCurrentIndex,
    canGoBack: anchorCanGoBack,
    canGoForward: anchorCanGoForward,
    pushAnchor: pushAnchorToTrail,
    goBack: goBackAnchorTrail,
    goForward: goForwardAnchorTrail,
    clearTrail: clearAnchorTrail,
  } = useAnchorTrail({ maxTrail: 20 })

  // Reverse Image & External Visual Query (CLIP ViT-B/32) state
  const [isVisualSearching, setIsVisualSearching] = React.useState(false)
  const [visualSearchError, setVisualSearchError] = React.useState<string | null>(null)
  const [isWindowDragOver, setIsWindowDragOver] = React.useState(false)
  const dragCounterRef = React.useRef(0)

  // Global anchor epoch counter & ripple wave reveal state
  const [anchorEpoch, setAnchorEpoch] = React.useState(0)
  const [isWaveActive, setIsWaveActive] = React.useState(false)
  const waveTimeoutRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    return () => {
      if (waveTimeoutRef.current !== null) {
        window.clearTimeout(waveTimeoutRef.current)
      }
    }
  }, [])

  // Fullscreen Inspector state shared across Eagle Gallery, Explore Tab, and Recently Viewed Dock
  const [canvasFullscreenArtwork, setCanvasFullscreenArtwork] = React.useState<Artwork | null>(null)

  // Shortcuts Help Modal state
  const [isShortcutsOpen, setIsShortcutsOpen] = React.useState(false)

  // Recently Viewed Visual History Trail (FIFO max 5 items, deduplicated)
  const { recentlyViewed, addToRecentlyViewed } = useRecentArtworks(5)

  const handleOpenFullscreen = React.useCallback(
    (artwork: Artwork) => {
      addToRecentlyViewed(artwork)
      setCanvasFullscreenArtwork(artwork)
    },
    [addToRecentlyViewed]
  )

  const handleCloseFullscreen = React.useCallback(() => {
    setCanvasFullscreenArtwork(null)
  }, [])

  const handleOpenShortcuts = React.useCallback(() => {
    setIsShortcutsOpen(true)
  }, [])

  const handleCloseShortcuts = React.useCallback(() => {
    setIsShortcutsOpen(false)
  }, [])

  const handleSearchTagFromViewer = React.useCallback((tag: string) => {
    setSearchQuery(tag)
    setCanvasFullscreenArtwork(null)
  }, [])

  // Track visible count inside Explore tab
  const [exploreVisibleCount, setExploreVisibleCount] = React.useState(0)
  const exploreScrollRef = React.useRef<HTMLDivElement | null>(null)

  // Toggle a color in the multi-color selection array (max 5 colors, deduplicated)
  const handleToggleColor = React.useCallback((hex: string) => {
    const normalized = hex.toUpperCase().trim()
    setSelectedColors((prev) => {
      if (prev.some((c) => c.toUpperCase() === normalized)) {
        return prev.filter((c) => c.toUpperCase() !== normalized)
      }
      if (prev.length >= 5) {
        return prev
      }
      return [...prev, normalized]
    })
  }, [])

  const handleClearColors = React.useCallback(() => {
    setSelectedColors([])
  }, [])

  const handleColorFilterChange = React.useCallback(
    (payload: { colors: string[]; mode: ColorFilterMode }) => {
      setSelectedColors(payload.colors.slice(0, 5))
      setColorFilterMode(payload.mode)
    },
    []
  )

  // Store the world center coordinates before entering Anchor Mode so we pick the closest repeating grid cycle
  const preAnchorWorldCenterRef = React.useRef<{ worldX: number; worldY: number }>({
    worldX: 0,
    worldY: 0,
  })

  // Infinite 2D Spatial Canvas Hook with 120Hz worldLayerRef + quantized cullViewport
  const {
    cullViewport,
    viewportRef,
    worldLayerRef,
    setViewport,
    isDragging,
    containerRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    centerView,
  } = useInfiniteCanvas({
    friction: 0.94,
    cullQuantizeStep: Math.round(gridPreset.cardWidth / 2),
    activeTab,
  })

  // Switch library and simultaneously clear active color anchor / fullscreen modal
  const handleSelectLibrary = React.useCallback((nextLib: EagleLibraryKey) => {
    setSelectedFolderId(null)
    setMediaTypeFilter('all')
    setCurrentLibrary(nextLib)
    if (waveTimeoutRef.current !== null) {
      window.clearTimeout(waveTimeoutRef.current)
      waveTimeoutRef.current = null
    }
    setIsWaveActive(false)
    setColorAnchorArtwork(null)
    setCanvasFullscreenArtwork(null)
    clearAnchorTrail()
  }, [clearAnchorTrail])

  // Load folders and tags metadata
  React.useEffect(() => {
    let isMounted = true
    setIsLoadingFolders(true)
    fetchCatalogTaxonomy(currentLibrary)
      .then((data) => {
        if (isMounted && data) {
          setFoldersData(data)
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingFolders(false)
      })
    return () => {
      isMounted = false
    }
  }, [currentLibrary])

  // Pre-compute descendant IDs for currently selected folder for O(1) matching
  const selectedFolderDescendants = React.useMemo(() => {
    if (!selectedFolderId || !foldersData) return null
    function findFolder(nodes: CatalogFolderNode[]): CatalogFolderNode | null {
      for (const n of nodes) {
        if (n.id === selectedFolderId) return n
        if (n.children && n.children.length > 0) {
          const found = findFolder(n.children)
          if (found) return found
        }
      }
      return null
    }
    const folder = findFolder(foldersData.folders)
    if (!folder) return new Set([selectedFolderId])
    return new Set(folder.allFolderIds)
  }, [selectedFolderId, foldersData])

  // Track window size for accurate viewport virtualization (rAF throttled)
  const [windowSize, setWindowSize] = React.useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
  })

  React.useEffect(() => {
    let resizeRaf: number | null = null
    const handleResize = () => {
      if (resizeRaf !== null) return
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null
        setWindowSize({ width: window.innerWidth, height: window.innerHeight })
      })
    }
    window.addEventListener('resize', handleResize, { passive: true })
    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeRaf !== null) cancelAnimationFrame(resizeRaf)
    }
  }, [])

  // Load items from selected Eagle library with client-side memory cache & progressive upgrade
  const {
    allArtworks,
    isLoadingLibrary,
    isEagleConnected,
    shuffleCurrentArtworks,
    refreshCurrentLibrary,
  } = useLibraryLoader({
    currentLibrary,
    onInitialCenterView: centerView,
  })

  // On-demand refresh action to purge caches and pull fresh data (?refresh=1)
  const handleRefreshLibrary = React.useCallback(() => {
    void refreshCurrentLibrary()
    void fetchCatalogTaxonomy(currentLibrary, true).then((data) => {
      if (data) setFoldersData(data)
    })
  }, [currentLibrary, refreshCurrentLibrary])

  // On-demand shuffle action to randomize the grid at any moment
  const handleShuffleArtworks = React.useCallback(() => {
    shuffleCurrentArtworks()
    if (activeTab === 'explore') {
      exploreScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      centerView()
    }
  }, [activeTab, centerView, shuffleCurrentArtworks])

  // Pre-calculate video and static image counts in current library
  const mediaCounts = React.useMemo(() => {
    let videos = 0
    let images = 0
    for (let i = 0; i < allArtworks.length; i++) {
      if (isVideoArtwork(allArtworks[i])) {
        videos++
      } else {
        images++
      }
    }
    return { total: allArtworks.length, videos, images }
  }, [allArtworks])

  // Defer rapid color-picker updates so pointer movement stays at 120 FPS while grid transitions smoothly
  const deferredSelectedColors = React.useDeferredValue(selectedColors)
  const deferredColorFilterMode = React.useDeferredValue(colorFilterMode)
  const deferredSearchQuery = React.useDeferredValue(searchQuery)

  // Filter artworks based on Eagle folder, smart tag facets (#tag, -tag), search query and multi-color perceptual CIELAB distance
  const filteredArtworks = React.useMemo(() => {
    const parsed = parseSearchQuery(deferredSearchQuery)
    const cleanQ = parsed.cleanText.toLowerCase()
    const hasIncludedTags = parsed.includedTags.length > 0
    const hasExcludedTags = parsed.excludedTags.length > 0
    const hasTagsFilter = hasIncludedTags || hasExcludedTags
    const hasColors = deferredSelectedColors.length > 0
    const isLiteralSearch = searchMode === 'literal'
    const hasFolder = selectedFolderDescendants !== null
    const hasMediaFilter = mediaTypeFilter !== 'all'

    if (!cleanQ && !hasTagsFilter && !hasColors && !hasFolder && !hasMediaFilter) {
      return allArtworks
    }

    return allArtworks.filter((item) => {
      // 0. Media Type filter (All vs Video vs Image)
      if (mediaTypeFilter === 'video' && !isVideoArtwork(item)) {
        return false
      }
      if (mediaTypeFilter === 'image' && isVideoArtwork(item)) {
        return false
      }

      // 1. Eagle Folder restriction (checks folder and all its descendants)
      if (selectedFolderDescendants !== null) {
        if (!item.folders || item.folders.length === 0) return false
        let inFolder = false
        for (let i = 0; i < item.folders.length; i++) {
          if (selectedFolderDescendants.has(item.folders[i])) {
            inFolder = true
            break
          }
        }
        if (!inFolder) return false
      }

      // 2. Smart Tag Facets with operators (#tag, -tag)
      if (hasTagsFilter) {
        if (!matchesTagFilters(item.tags, parsed.includedTags, parsed.excludedTags)) {
          return false
        }
      }

      // 3. Literal text query (title, artist, annotation)
      if (cleanQ && isLiteralSearch) {
        const matchesQuery = item.searchText
          ? item.searchText.includes(cleanQ)
          : (item.title.toLowerCase().includes(cleanQ) || item.artist.toLowerCase().includes(cleanQ))
        if (!matchesQuery) return false
      }

      // 4. Perceptual Multi-Color CIELAB filter
      if (hasColors) {
        if (!matchesColorFilter(item, deferredSelectedColors, deferredColorFilterMode)) {
          return false
        }
      }

      return true
    })
  }, [
    allArtworks,
    deferredSearchQuery,
    selectedFolderDescendants,
    deferredSelectedColors,
    deferredColorFilterMode,
    searchMode,
    mediaTypeFilter,
  ])

  // Radial Chromatic / Aesthetic / Hybrid / Grade Sorting via parallel Web Worker (with predictive pointer-down pre-sorting)
  const { scoredArtworks, prefetchAnchorSort } = useColorSortWorker(
    filteredArtworks,
    colorAnchorArtwork,
    anchorMode,
    gradeTuning
  )

  // Ordered artworks list for Fullscreen navigation
  const canvasNavigationArtworks = React.useMemo(() => {
    if (colorAnchorArtwork && scoredArtworks.length > 0) {
      return scoredArtworks.map((s) => s.artwork)
    }
    return filteredArtworks
  }, [colorAnchorArtwork, scoredArtworks, filteredArtworks])

  // Standard Infinite Masonry Column Model adapted to selected GridSizePreset
  const infiniteModel = React.useMemo(() => {
    return buildInfiniteGridModel(
      filteredArtworks,
      gridPreset.numTemplateCols,
      gridPreset.cardWidth,
      gridPreset.gap
    )
  }, [filteredArtworks, gridPreset.numTemplateCols, gridPreset.cardWidth, gridPreset.gap])

  // O(log N) Spatial Virtualization: Computes only the cards currently visible in cullViewport + buffer
  const visibleCards = React.useMemo(() => {
    if (activeTab !== 'canvas') return []

    if (colorAnchorArtwork && scoredArtworks.length > 0) {
      return getHarmonizedVirtualCards(
        scoredArtworks,
        cullViewport.x,
        cullViewport.y,
        windowSize.width,
        windowSize.height,
        gridPreset.cardWidth,
        gridPreset.cardHeight,
        gridPreset.gap,
        520
      )
    }

    if (!infiniteModel) return []
    return getVisibleVirtualCards(
      infiniteModel,
      cullViewport.x,
      cullViewport.y,
      windowSize.width,
      windowSize.height,
      520
    )
  }, [
    activeTab,
    colorAnchorArtwork,
    scoredArtworks,
    infiniteModel,
    cullViewport.x,
    cullViewport.y,
    windowSize.width,
    windowSize.height,
    gridPreset.cardWidth,
    gridPreset.cardHeight,
    gridPreset.gap,
  ])

  // Stable ref for latest layout/anchor context so handleToggleArtworkSelection never changes identity
  // (Prevents stale closures inside memoized ArtworkCard instances while keeping 0 re-renders on pan/resize)
  const selectionContextRef = React.useRef({
    colorAnchorArtwork,
    infiniteModel,
    windowWidth: windowSize.width,
    windowHeight: windowSize.height,
    cardWidth: gridPreset.cardWidth,
  })
  React.useLayoutEffect(() => {
    selectionContextRef.current = {
      colorAnchorArtwork,
      infiniteModel,
      windowWidth: windowSize.width,
      windowHeight: windowSize.height,
      cardWidth: gridPreset.cardWidth,
    }
  }, [colorAnchorArtwork, infiniteModel, windowSize.width, windowSize.height, gridPreset.cardWidth])

  // Exits Anchor Mode while keeping the anchor card at its exact current screen position (zero visual jump)
  const exitAnchorToCardPosition = React.useCallback(
    (anchorToFollow?: Artwork | null) => {
      const {
        colorAnchorArtwork: currentAnchor,
        infiniteModel: currentModel,
      } = selectionContextRef.current

      const targetArt = anchorToFollow ?? currentAnchor
      // In Anchor Mode, the anchor card is at world (0, 0), so its current screen position is simply viewportRef.current
      const currentScreenX = viewportRef.current.x
      const currentScreenY = viewportRef.current.y

      if (waveTimeoutRef.current !== null) {
        window.clearTimeout(waveTimeoutRef.current)
        waveTimeoutRef.current = null
      }
      setIsWaveActive(false)
      setColorAnchorArtwork(null)
      clearAnchorTrail()

      if (targetArt && currentModel) {
        const { worldX: refX, worldY: refY } = preAnchorWorldCenterRef.current
        const pos = findArtworkWorldPosition(currentModel, targetArt.id, refX, refY)
        if (pos) {
          // Place the camera so that (pos.worldX + viewport.x, pos.worldY + viewport.y) === (currentScreenX, currentScreenY)
          const targetX = Math.round(currentScreenX - pos.worldX)
          const targetY = Math.round(currentScreenY - pos.worldY)
          setViewport({ x: targetX, y: targetY, scale: 1 })
        } else {
          centerView()
        }
      }
    },
    [setViewport, viewportRef, centerView, clearAnchorTrail]
  )

  // Restores an anchor from the breadcrumb trail or keyboard history and re-centers view
  const handleNavigateToAnchor = React.useCallback(
    (targetArtwork: Artwork) => {
      addToRecentlyViewed(targetArtwork)

      const cardWidth = gridPreset.cardWidth
      const clampedAspect = Math.max(0.55, Math.min(2.0, targetArtwork.aspectRatio || 1.0))
      const anchorHeight = Math.round(cardWidth / clampedAspect)

      // Center camera smoothly on the restored anchor in world (0, 0)
      setViewport({
        x: Math.round(windowSize.width / 2 - cardWidth / 2),
        y: Math.round(windowSize.height / 2 - anchorHeight / 2),
        scale: 1,
      })

      // Start ripple wave reveal
      setAnchorEpoch((prev) => prev + 1)
      setIsWaveActive(true)
      if (waveTimeoutRef.current !== null) {
        window.clearTimeout(waveTimeoutRef.current)
      }
      waveTimeoutRef.current = window.setTimeout(() => {
        setIsWaveActive(false)
        waveTimeoutRef.current = null
      }, 1050)

      setColorAnchorArtwork(targetArtwork)
    },
    [addToRecentlyViewed, gridPreset.cardWidth, setViewport, windowSize.width, windowSize.height]
  )

  const handleAnchorGoBack = React.useCallback(() => {
    const prev = goBackAnchorTrail()
    if (prev) {
      handleNavigateToAnchor(prev)
    }
  }, [goBackAnchorTrail, handleNavigateToAnchor])

  const handleAnchorGoForward = React.useCallback(() => {
    const next = goForwardAnchorTrail()
    if (next) {
      handleNavigateToAnchor(next)
    }
  }, [goForwardAnchorTrail, handleNavigateToAnchor])

  // Global keyboard shortcuts: '?' toggles help modal, 'Escape' closes modal or clears canvas anchor, 'Alt + Left/Right' navigates anchor trail
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase()
      const isContentEditable = (document.activeElement as HTMLElement)?.isContentEditable
      if (
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        activeTag === 'select' ||
        isContentEditable
      ) {
        return
      }

      if (e.key === '?') {
        e.preventDefault()
        setIsShortcutsOpen((prev) => !prev)
        return
      }

      if (e.key === 'Escape' && isShortcutsOpen) {
        e.preventDefault()
        setIsShortcutsOpen(false)
        return
      }

      if (e.key === 'Escape' && activeTab === 'canvas' && !canvasFullscreenArtwork && !isShortcutsOpen) {
        if (colorAnchorArtwork?.isTextQuery) setSearchQuery("")
        exitAnchorToCardPosition()
        setSelectedColors([])
        setMediaTypeFilter('all')
        return
      }

      // 'V' shortcut: Toggle video media filter (All <-> Videos)
      if (
        (e.key === 'v' || e.key === 'V') &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !canvasFullscreenArtwork &&
        !isShortcutsOpen
      ) {
        e.preventDefault()
        setMediaTypeFilter((prev) => (prev === 'video' ? 'all' : 'video'))
        return
      }

      // Alt + ArrowLeft: Navigate back in anchor trail (Rabbit Hole)
      if (activeTab === 'canvas' && !canvasFullscreenArtwork && !isShortcutsOpen) {
        if (e.altKey && e.key === 'ArrowLeft') {
          if (anchorCanGoBack) {
            e.preventDefault()
            handleAnchorGoBack()
            return
          }
        }

        // Alt + ArrowRight: Navigate forward in anchor trail
        if (e.altKey && e.key === 'ArrowRight') {
          if (anchorCanGoForward) {
            e.preventDefault()
            handleAnchorGoForward()
            return
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    activeTab,
    canvasFullscreenArtwork,
    isShortcutsOpen,
    exitAnchorToCardPosition,
    colorAnchorArtwork?.isTextQuery,
    anchorCanGoBack,
    anchorCanGoForward,
    handleAnchorGoBack,
    handleAnchorGoForward,
  ])

  // Action: Toggle artwork selection as anchor directly on card click while keeping the clicked card in the exact same screen spot!
  const handleToggleArtworkSelection = React.useCallback(
    (artwork: Artwork, clickedWorldX?: number, clickedWorldY?: number) => {
      addToRecentlyViewed(artwork)

      const {
        colorAnchorArtwork: currentAnchor,
        windowWidth,
        windowHeight,
        cardWidth,
      } = selectionContextRef.current

      // If clicking the current anchor, exit anchor mode
      if (currentAnchor?.id === artwork.id) {
        if (waveTimeoutRef.current !== null) {
          window.clearTimeout(waveTimeoutRef.current)
          waveTimeoutRef.current = null
        }
        setIsWaveActive(false)
        exitAnchorToCardPosition(artwork)
        return
      }

      // If entering anchor mode from normal grid mode, record the world reference point so exiting finds the same cycle
      if (!currentAnchor) {
        preAnchorWorldCenterRef.current = {
          worldX: clickedWorldX ?? (windowWidth / 2 - viewportRef.current.x),
          worldY: clickedWorldY ?? (windowHeight / 2 - viewportRef.current.y),
        }
      }

      const clampedAspect = Math.max(0.55, Math.min(2.0, artwork.aspectRatio || 1.0))
      const anchorHeight = Math.round(cardWidth / clampedAspect)

      const targetX =
        clickedWorldX !== undefined
          ? Math.round(viewportRef.current.x + clickedWorldX)
          : Math.round(windowWidth / 2 - cardWidth / 2)
      const targetY =
        clickedWorldY !== undefined
          ? Math.round(viewportRef.current.y + clickedWorldY)
          : Math.round(windowHeight / 2 - anchorHeight / 2)

      // Start fresh epoch and ripple wave
      setAnchorEpoch((prev) => prev + 1)
      setIsWaveActive(true)
      if (waveTimeoutRef.current !== null) {
        window.clearTimeout(waveTimeoutRef.current)
      }
      waveTimeoutRef.current = window.setTimeout(() => {
        setIsWaveActive(false)
        waveTimeoutRef.current = null
      }, 1050)

      setColorAnchorArtwork(artwork)
      pushAnchorToTrail(artwork)
      setViewport({ x: targetX, y: targetY, scale: 1 })
    },
    [addToRecentlyViewed, exitAnchorToCardPosition, setViewport, viewportRef, pushAnchorToTrail]
  )

  const handleResetColorAnchor = React.useCallback(() => {
    setGradeTuning({ balance: 0 })
    exitAnchorToCardPosition()
  }, [exitAnchorToCardPosition])

  const handleApplyVisualSearchAnchor = React.useCallback(
    (artwork: Artwork) => {
      addToRecentlyViewed(artwork)
      setActiveTab('canvas')

      preAnchorWorldCenterRef.current = { worldX: 0, worldY: 0 }
      setColorAnchorArtwork(artwork)
      pushAnchorToTrail(artwork)
      setAnchorMode(artwork.isTextQuery ? 'visual' : 'hybrid')
      setGradeTuning({ balance: 0 })

      const cardWidth = gridPreset.cardWidth
      const clampedAspect = Math.max(0.55, Math.min(2.0, artwork.aspectRatio || 1.0))
      const anchorHeight = Math.round(cardWidth / clampedAspect)

      setViewport({
        x: Math.round(windowSize.width / 2 - cardWidth / 2),
        y: Math.round(windowSize.height / 2 - anchorHeight / 2),
        scale: 1,
      })

      setAnchorEpoch((prev) => prev + 1)
      setIsWaveActive(true)
      if (waveTimeoutRef.current !== null) {
        window.clearTimeout(waveTimeoutRef.current)
      }
      waveTimeoutRef.current = window.setTimeout(() => {
        setIsWaveActive(false)
        waveTimeoutRef.current = null
      }, 1250)
    },
    [addToRecentlyViewed, gridPreset.cardWidth, setViewport, windowSize.width, windowSize.height, pushAnchorToTrail]
  )

  const executeVisualSearch = React.useCallback(
    async (source: { file?: File | Blob; url?: string; dataUrl?: string }) => {
      setIsVisualSearching(true)
      setVisualSearchError(null)
      try {
        const { artwork } = await queryVisualSearch(source)
        handleApplyVisualSearchAnchor(artwork)
      } catch (err: any) {
        setVisualSearchError(err?.message || 'Falha ao processar busca visual por imagem.')
        window.setTimeout(() => {
          setVisualSearchError(null)
        }, 5000)
      } finally {
        setIsVisualSearching(false)
      }
    },
    [handleApplyVisualSearchAnchor]
  )

  const executeSemanticSearch = React.useCallback(
    async (queryText: string) => {
      const q = queryText.trim()
      if (!q) return
      setIsSemanticSearching(true)
      setSemanticSearchError(null)
      try {
        const { artwork } = await querySemanticSearch(q)
        handleApplyVisualSearchAnchor(artwork)
      } catch (err: any) {
        setSemanticSearchError(err?.message || t('canvas.semanticSearchError'))
        window.setTimeout(() => {
          setSemanticSearchError(null)
        }, 5000)
      } finally {
        setIsSemanticSearching(false)
      }
    },
    [handleApplyVisualSearchAnchor]
  )

  const handleSearchModeChange = React.useCallback(
    (newMode: 'literal' | 'semantic') => {
      setSearchMode(newMode)
      if (newMode === 'semantic') {
        if (searchQuery.trim()) {
          void executeSemanticSearch(searchQuery.trim())
        }
      } else {
        if (colorAnchorArtwork?.isTextQuery) {
          handleResetColorAnchor()
        }
      }
    },
    [searchQuery, executeSemanticSearch, colorAnchorArtwork?.isTextQuery, handleResetColorAnchor]
  )

  const handleSearchChange = React.useCallback(
    (q: string) => {
      setSearchQuery(q)
      if (!q.trim() && colorAnchorArtwork?.isTextQuery) {
        handleResetColorAnchor()
      }
    },
    [colorAnchorArtwork?.isTextQuery, handleResetColorAnchor]
  )

  // Auto-trigger semantic search when user pauses typing in semantic mode (550ms debounce)
  React.useEffect(() => {
    if (searchMode !== 'semantic') return
    const trimmed = searchQuery.trim()
    if (!trimmed || trimmed.length < 2) return
    if (colorAnchorArtwork?.isTextQuery && colorAnchorArtwork.title === trimmed) return

    const timer = window.setTimeout(() => {
      void executeSemanticSearch(trimmed)
    }, 550)

    return () => window.clearTimeout(timer)
  }, [searchQuery, searchMode, colorAnchorArtwork, executeSemanticSearch])

  // Global Drag & Drop listener for external image files
  React.useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        dragCounterRef.current++
        setIsWindowDragOver(true)
      }
    }
    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault()
      }
    }
    const handleDragLeave = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        dragCounterRef.current--
        if (dragCounterRef.current <= 0) {
          dragCounterRef.current = 0
          setIsWindowDragOver(false)
        }
      }
    }
    const handleDrop = (e: DragEvent) => {
      dragCounterRef.current = 0
      setIsWindowDragOver(false)
      const files = e.dataTransfer?.files
      if (files && files.length > 0) {
        const file = files[0]
        if (file.type.startsWith('image/')) {
          e.preventDefault()
          void executeVisualSearch({ file })
        }
      }
    }

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)

    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [executeVisualSearch])

  // Global Clipboard Paste listener (Ctrl+V) for image files and image URLs
  React.useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase()
      const isContentEditable = (document.activeElement as HTMLElement)?.isContentEditable
      if (activeTag === 'input' || activeTag === 'textarea' || isContentEditable) {
        return
      }

      const items = e.clipboardData?.items
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              e.preventDefault()
              void executeVisualSearch({ file })
              return
            }
          }
        }
      }

      const pastedText = e.clipboardData?.getData('text')?.trim()
      if (
        pastedText &&
        (pastedText.startsWith('http://') || pastedText.startsWith('https://')) &&
        (/\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(pastedText) ||
          pastedText.includes('images') ||
          pastedText.includes('img'))
      ) {
        e.preventDefault()
        void executeVisualSearch({ url: pastedText })
      }
    }

    window.addEventListener('paste', handleGlobalPaste)
    return () => window.removeEventListener('paste', handleGlobalPaste)
  }, [executeVisualSearch])

  const handleRecenterOrScrollTop = React.useCallback(() => {
    const {
      colorAnchorArtwork: currentAnchor,
      windowWidth,
      windowHeight,
      cardWidth,
    } = selectionContextRef.current

    if (activeTab === 'explore') {
      exploreScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    } else if (currentAnchor) {
      const clampedAspect = Math.max(0.55, Math.min(2.0, currentAnchor.aspectRatio || 1.0))
      const anchorHeight = Math.round(cardWidth / clampedAspect)
      setViewport({
        x: Math.round(windowWidth / 2 - cardWidth / 2),
        y: Math.round(windowHeight / 2 - anchorHeight / 2),
        scale: 1,
      })
    } else {
      centerView()
    }
  }, [activeTab, setViewport, centerView])

  const calibratedAccent = React.useMemo(() => {
    return calibrateAnchorAccent(colorAnchorArtwork?.dominantColor)
  }, [colorAnchorArtwork?.dominantColor])

  const activeAmbientColor =
    selectedColors[selectedColors.length - 1] || (colorAnchorArtwork ? calibratedAccent.accent : null)

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-[#09090b] select-none"
      style={{
        '--anchor-accent': calibratedAccent.accent,
        '--anchor-accent-bright': calibratedAccent.bright,
        '--anchor-accent-subtle': calibratedAccent.subtle,
      } as React.CSSProperties}
    >
      {/* Subtle Ambient Chromatic Wash that reacts fluidly to the active color filter / anchor */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-700 ease-out"
        style={{
          opacity: activeAmbientColor ? 0.16 : 0,
          background: activeAmbientColor
            ? `radial-gradient(circle at 50% 35%, ${activeAmbientColor} 0%, transparent 70%)`
            : 'none',
        }}
      />

      {/* Subtle starfield / grid texture in deep background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-15"
        style={{
          backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Top Floating Navigation with Continuous Multi-Color Palette Filter, Library Switcher & Tab Switcher */}
      <FloatingNav
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        searchMode={searchMode}
        onSearchModeChange={handleSearchModeChange}
        onSemanticSearch={executeSemanticSearch}
        isSemanticSearching={isSemanticSearching}
        selectedColors={selectedColors}
        onToggleColor={handleToggleColor}
        onClearColors={handleClearColors}
        colorFilterMode={colorFilterMode}
        onColorFilterModeChange={setColorFilterMode}
        onColorFilterChange={handleColorFilterChange}
        maxColors={MAX_FILTER_COLORS}
        totalCount={filteredArtworks.length}
        isEagleConnected={isEagleConnected}
        currentLibrary={currentLibrary}
        onSelectLibrary={handleSelectLibrary}
        isLoadingLibrary={isLoadingLibrary}
        colorAnchorArtwork={colorAnchorArtwork}
        onResetColorAnchor={handleResetColorAnchor}
        anchorMode={anchorMode}
        onAnchorModeChange={setAnchorMode}
        gradeTuning={gradeTuning}
        onGradeTuningChange={setGradeTuning}
        onToggleSearchSettings={() => setIsSearchSettingsOpen((prev) => !prev)}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onVisualSearch={handleApplyVisualSearchAnchor}
        isVisualSearching={isVisualSearching}
        folders={foldersData?.folders || []}
        selectedFolderId={selectedFolderId}
        onSelectFolder={setSelectedFolderId}
        tags={foldersData?.tags || []}
        tagsGroups={foldersData?.tagsGroups || []}
        mediaTypeFilter={mediaTypeFilter}
        onMediaTypeFilterChange={setMediaTypeFilter}
        videoCount={mediaCounts.videos}
        imageCount={mediaCounts.images}
      />

      {/* View Mode 1: Infinite 2D Spatial Canvas */}
      {activeTab === 'canvas' ? (
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={cn(
            "w-full h-full touch-none relative",
            isDragging ? "cursor-grabbing" : "cursor-grab"
          )}
        >
          {/* World Coordinate Transform Layer (120Hz GPU accelerated via worldLayerRef) */}
          <div
            ref={worldLayerRef}
            className="absolute top-0 left-0"
            style={{
              transform: `translate3d(${cullViewport.x}px, ${cullViewport.y}px, 0)`,
              transformOrigin: '0 0',
              willChange: 'transform',
            }}
          >
            {visibleCards.map((card) => (
              <ArtworkCard
                key={card.key}
                artwork={card.artwork}
                overrideWorldX={card.worldX}
                overrideWorldY={card.worldY}
                overrideWidth={card.width}
                overrideHeight={card.height}
                isAnchor={card.artwork.id === colorAnchorArtwork?.id}
                similarityPercent={card.similarityPercent}
                isHarmonizedMode={Boolean(colorAnchorArtwork)}
                anchorMode={anchorMode}
                isWaveActive={isWaveActive}
                waveDelayMs={card.waveDelayMs}
                anchorEpoch={anchorEpoch}
                isCanvasDragging={isDragging}
                onSelect={handleToggleArtworkSelection}
                onPrefetchSort={prefetchAnchorSort}
                onOpenFullscreen={handleOpenFullscreen}
              />
            ))}

            {/* Loading state while library loads */}
            {isLoadingLibrary && (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center p-8 rounded-2xl bg-zinc-950/90 backdrop-blur-xl text-center shadow-2xl min-w-[280px]"
                style={{ left: 0, top: 0 }}
              >
                <OmnimageLogo size={36} interactive={false} className="mb-3" />
                <h3 className="text-sm font-semibold text-zinc-200">{t("canvas.loadingLibrary")}</h3>
                <p className="text-xs text-zinc-400 mt-1">{t("canvas.readingLibrary", { lib: currentLibrary === "google-flow" ? "Prompts" : "Design" })}</p>
              </div>
            )}

            {/* Empty state if search or multi-color filter finds nothing */}
            {!isLoadingLibrary && filteredArtworks.length === 0 && (
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center p-8 rounded-2xl border border-zinc-800 bg-zinc-950/90 backdrop-blur-xl text-center w-80 shadow-2xl"
                style={{ left: 0, top: 0 }}
              >
                <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 mb-3">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-200">{t("canvas.noWorksFound")}</h3>
                <p className="text-xs text-zinc-400 mt-1">{t("canvas.noWorksFoundDesc", { lib: currentLibrary === "google-flow" ? "Prompts" : "Design" })}</p>
                <button
                  onClick={() => {
                    setSearchQuery("")
                    setSelectedColors([])
                  }}
                  className="mt-4 px-3 py-1.5 rounded-full bg-zinc-800 text-xs text-zinc-200 hover:text-white transition-all active:scale-95 cursor-pointer"
                >
                  {t("taxonomy.clearCurrentTab")}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* View Mode 2: Explore Tab (Pure Vertical Scroll + Fullscreen Eagle Inspector) */
        <ExploreFeedView
          artworks={canvasNavigationArtworks}
          gridSize={gridSize}
          onSelectArtwork={handleOpenFullscreen}
          onVisibleCountChange={setExploreVisibleCount}
          scrollContainerRef={exploreScrollRef}
          isLoading={isLoadingLibrary}
        />
      )}

      {/* Fullscreen Eagle Inspector shared across Eagle Gallery, Explore Tab, and Recently Viewed Dock */}
      <ExploreFullscreenViewer
        artwork={canvasFullscreenArtwork}
        artworks={canvasNavigationArtworks}
        onClose={handleCloseFullscreen}
        onSelectArtwork={handleOpenFullscreen}
        selectedColors={selectedColors}
        onToggleColor={handleToggleColor}
        onSearchTag={handleSearchTagFromViewer}
        folderNameMap={foldersData?.folderNameMap}
        onSelectFolder={setSelectedFolderId}
      />

      {/* Floating Bottom-Left Search Settings & Info Card */}
      <FloatingInfoCard
        isEagleConnected={isEagleConnected}
        totalCount={allArtworks.length}
        currentLibraryName={
          currentLibrary === 'google-flow' ? 'Prompts' : currentLibrary === 'Comfy' ? 'Comfy' : 'Design'
        }
        activeTab={activeTab}
        anchorArtwork={colorAnchorArtwork}
        anchorMode={anchorMode}
        onSelectAnchorMode={setAnchorMode}
        gradeTuning={gradeTuning}
        onGradeTuningChange={setGradeTuning}
        isOpen={isSearchSettingsOpen}
        onToggleOpen={() => setIsSearchSettingsOpen((prev) => !prev)}
      />

      {/* Floating Bottom-Center Recently Viewed Dock (Visual History Trail & Rabbit Hole Navigation) */}
      <RecentlyViewedDock
        items={recentlyViewed}
        activeArtworkId={canvasFullscreenArtwork?.id || colorAnchorArtwork?.id}
        onSelectArtwork={handleOpenFullscreen}
        onRestoreAnchor={
          activeTab === 'canvas'
            ? (artwork) => handleToggleArtworkSelection(artwork)
            : undefined
        }
        canGoBack={anchorCanGoBack}
        canGoForward={anchorCanGoForward}
        onGoBack={handleAnchorGoBack}
        onGoForward={handleAnchorGoForward}
        prevTitle={anchorTrail[anchorCurrentIndex - 1]?.title}
        nextTitle={anchorTrail[anchorCurrentIndex + 1]?.title}
      />

      {/* Floating Bottom-Right Canvas Controls (Work in View, 3 Grid Density Icons, Shuffle & Recenter) */}
      <CanvasControls
        onCenterView={handleRecenterOrScrollTop}
        onShuffle={handleShuffleArtworks}
        onRefresh={handleRefreshLibrary}
        isRefreshing={isLoadingLibrary}
        onOpenShortcuts={handleOpenShortcuts}
        visibleCount={activeTab === 'explore' ? exploreVisibleCount : visibleCards.length}
        totalCount={filteredArtworks.length}
        gridSize={gridSize}
        onGridSizeChange={setGridSize}
        centerLabel={activeTab === 'explore' ? t('common.backToTop') : t('common.recenterGrid')}
      />

      {/* Global Keyboard Shortcuts & Gestures Modal ('?' key trigger) */}
      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={handleCloseShortcuts}
        activeContext={
          canvasFullscreenArtwork
            ? 'viewer'
            : activeTab === 'explore'
            ? 'explore'
            : 'canvas'
        }
      />
      {/* Global Drag-and-Drop Image Dropzone Overlay */}
      {isWindowDragOver && (
        <div className="fixed inset-0 z-50 pointer-events-none flex flex-col items-center justify-center bg-black/80 backdrop-blur-md border-2 border-dashed border-amber-400/80 animate-in fade-in duration-150">
          <div className="flex flex-col items-center p-8 rounded-3xl bg-zinc-950/90 border border-zinc-800 shadow-2xl scale-105 transition-transform">
            <UploadCloud className="w-16 h-16 text-amber-400 animate-bounce mb-4" />
            <h3 className="text-xl font-semibold text-white tracking-tight">
              {t("canvas.dropzoneTitle")}
            </h3>
            <p className="text-xs text-zinc-400 font-mono mt-1.5 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{t("canvas.dropzoneSubtitle")}</span>
            </p>
          </div>
        </div>
      )}

      {/* Floating Status & Progress Pill for Visual Search */}
      {isVisualSearching && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none flex items-center gap-2.5 px-4 py-2 rounded-full bg-zinc-950/95 border border-amber-500/40 backdrop-blur-xl shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
          <span className="text-xs text-zinc-200 font-medium">
            Extraindo vetor visual CLIP ViT-B/32 e harmonizando radialmente...
          </span>
        </div>
      )}

      {/* Floating Error Alert Toast for Visual Search */}
      {(visualSearchError || semanticSearchError) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-red-950/95 border border-red-700/60 backdrop-blur-xl shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 text-red-200 text-xs">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{visualSearchError || semanticSearchError}</span>
          <button
            onClick={() => {
              setVisualSearchError(null)
              setSemanticSearchError(null)
            }}
            className="ml-2 p-0.5 rounded-full hover:bg-red-900/60 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}



