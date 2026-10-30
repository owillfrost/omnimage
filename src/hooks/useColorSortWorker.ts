import * as React from 'react'
import type { Artwork } from '../types/artwork'
import {
  sortArtworksByColorProximity,
  type ScoredArtwork,
  type GradeTuningOptions,
} from '../core/colorClustering'
import type { LayoutTuningOptions } from '../core/layoutExtractor'
import type {
  ColorSortWorkerRequest,
  ColorSortWorkerResponse,
  SimilaritySortMode,
} from '../workers/colorSort.worker'
import { getCatalogProvider } from '../providers/providerFactory'

// Module-level WeakMap keyed by the filteredArtworks array reference.
// Automatically garbage-collected when filteredArtworks changes, and safe to read in useMemo.
const ANCHOR_SORT_CACHE = new WeakMap<Artwork[], Map<string, ScoredArtwork[]>>()

function getOrCreateCacheForList(list: Artwork[]): Map<string, ScoredArtwork[]> {
  let map = ANCHOR_SORT_CACHE.get(list)
  if (!map) {
    map = new Map<string, ScoredArtwork[]>()
    ANCHOR_SORT_CACHE.set(list, map)
  }
  return map
}

function extractStyleTokens(artwork: Artwork): string[] {
  const rawText = `${artwork.title || ''} ${artwork.culture && artwork.culture !== 'Local Asset' ? artwork.culture : ''}`
  const matches = rawText.toLowerCase().match(/[a-z0-9à-ú]{3,20}/g)
  if (!matches) return []
  return Array.from(new Set(matches)).slice(0, 24)
}

function getCacheKey(
  targetId: string,
  mode: SimilaritySortMode,
  gradeTuning?: GradeTuningOptions,
  layoutTuning?: LayoutTuningOptions
): string {
  if (mode === 'layout' && layoutTuning) {
    const w = layoutTuning.aspectWeight ?? 0.15
    const sens = layoutTuning.sensitivity ?? 1.0
    return `${targetId}:layout:w${w}:se${sens}`
  }
  if (mode !== 'grade' || !gradeTuning) return `${targetId}:${mode}`
  const bal = gradeTuning.balance ?? 0
  const s = gradeTuning.shadowOverride ? `${gradeTuning.shadowOverride.a},${gradeTuning.shadowOverride.b}` : ''
  const h = gradeTuning.highlightOverride ? `${gradeTuning.highlightOverride.a},${gradeTuning.highlightOverride.b}` : ''
  const sens = gradeTuning.sensitivity ?? 0.75
  const skin = gradeTuning.protectSkinTones ?? true ? '1' : '0'
  const neut = gradeTuning.excludeNeutrals ? '1' : '0'
  return `${targetId}:grade:b${bal}:s${s}:h${h}:se${sens}:sk${skin}:n${neut}`
}

/**
 * Orchestrates off-thread CIELAB D65 + HSL + CLIP visual embedding + 16x9 spatial layout radial sorting via Web Worker
 * with zero-copy Transferable TypedArrays, split-toning grade tuning, and predictive pointer-down pre-sorting.
 */
export function useColorSortWorker(
  filteredArtworks: Artwork[],
  colorAnchorArtwork: Artwork | null,
  mode: SimilaritySortMode = 'hybrid',
  gradeTuning?: GradeTuningOptions,
  layoutTuning?: LayoutTuningOptions
) {
  const workerRef = React.useRef<Worker | null>(null)
  const requestIdRef = React.useRef(0)
  const listVersionRef = React.useRef(0)
  const artworksRef = React.useRef<Artwork[]>(filteredArtworks)
  const anchorRef = React.useRef<Artwork | null>(colorAnchorArtwork)
  const modeRef = React.useRef<SimilaritySortMode>(mode)
  const gradeTuningRef = React.useRef<GradeTuningOptions | undefined>(gradeTuning)
  const layoutTuningRef = React.useRef<LayoutTuningOptions | undefined>(layoutTuning)
  const pendingKeysRef = React.useRef<Set<string>>(new Set())
  const loadedEmbeddingLibsRef = React.useRef<Set<string>>(new Set())
  const loadingEmbeddingLibsRef = React.useRef<Map<string, Promise<boolean>>>(new Map())
  const loadedLayoutLibsRef = React.useRef<Set<string>>(new Set())
  const loadingLayoutLibsRef = React.useRef<Map<string, Promise<boolean>>>(new Map())

  React.useEffect(() => {
    anchorRef.current = colorAnchorArtwork
  }, [colorAnchorArtwork])

  React.useEffect(() => {
    modeRef.current = mode
  }, [mode])

  React.useEffect(() => {
    gradeTuningRef.current = gradeTuning
  }, [gradeTuning])

  React.useEffect(() => {
    layoutTuningRef.current = layoutTuning
  }, [layoutTuning])

  const [workerResult, setWorkerResult] = React.useState<{
    targetId: string
    mode: SimilaritySortMode
    cacheKey: string
    artworksList: Artwork[]
    scored: ScoredArtwork[]
    hasVisualEmbeddings: boolean
    hasLayoutVectors: boolean
  } | null>(null)

  const ensureEmbeddingsForLibrary = React.useCallback((libraryKey: string): Promise<boolean> => {
    if (loadedEmbeddingLibsRef.current.has(libraryKey)) {
      return Promise.resolve(true)
    }
    const existing = loadingEmbeddingLibsRef.current.get(libraryKey)
    if (existing) return existing

    const promise = (async () => {
      try {
        const provider = getCatalogProvider()
        const data = await provider.fetchEmbeddingsBinary(libraryKey)
        if (!data || data.buffer.byteLength < 12) return false

        const { dim, buffer } = data
        const view = new DataView(buffer)
        const headerByteLen = view.getUint32(0, true)
        if (headerByteLen <= 0 || 4 + headerByteLen > buffer.byteLength) {
          return false
        }

        const headerBytes = new Uint8Array(buffer, 4, headerByteLen)
        const idsJson = new TextDecoder('utf-8').decode(headerBytes)
        const ids = JSON.parse(idsJson) as string[]
        const vectorBuffer = buffer.slice(4 + headerByteLen)
        const vectors = new Int8Array(vectorBuffer)

        const worker = workerRef.current
        if (!worker) return false

        worker.postMessage(
          {
            type: 'SET_EMBEDDINGS',
            library: libraryKey,
            dim,
            ids,
            vectors,
          } as ColorSortWorkerRequest,
          [vectorBuffer]
        )

        loadedEmbeddingLibsRef.current.add(libraryKey)
        return true
      } catch {
        return false
      } finally {
        loadingEmbeddingLibsRef.current.delete(libraryKey)
      }
    })()

    loadingEmbeddingLibsRef.current.set(libraryKey, promise)
    return promise
  }, [])

  const ensureLayoutForLibrary = React.useCallback((libraryKey: string): Promise<boolean> => {
    if (loadedLayoutLibsRef.current.has(libraryKey)) {
      return Promise.resolve(true)
    }
    const existing = loadingLayoutLibsRef.current.get(libraryKey)
    if (existing) return existing

    const promise = (async () => {
      try {
        const provider = getCatalogProvider()
        if (!provider.fetchLayoutBinary) return false
        const data = await provider.fetchLayoutBinary(libraryKey)
        if (!data || data.buffer.byteLength < 12) return false

        const { dim, buffer } = data
        const view = new DataView(buffer)
        const headerByteLen = view.getUint32(0, true)
        if (headerByteLen <= 0 || 4 + headerByteLen > buffer.byteLength) {
          return false
        }

        const headerBytes = new Uint8Array(buffer, 4, headerByteLen)
        const idsJson = new TextDecoder('utf-8').decode(headerBytes)
        const ids = JSON.parse(idsJson) as string[]
        const vectorBuffer = buffer.slice(4 + headerByteLen)
        const vectors = new Uint8Array(vectorBuffer)

        const worker = workerRef.current
        if (!worker) return false

        worker.postMessage(
          {
            type: 'SET_LAYOUT_VECTORS',
            library: libraryKey,
            dim,
            ids,
            vectors,
          } as ColorSortWorkerRequest,
          [vectorBuffer]
        )

        loadedLayoutLibsRef.current.add(libraryKey)
        return true
      } catch {
        return false
      } finally {
        loadingLayoutLibsRef.current.delete(libraryKey)
      }
    })()

    loadingLayoutLibsRef.current.set(libraryKey, promise)
    return promise
  }, [])

  // Initialize Web Worker once
  React.useEffect(() => {
    const worker = new Worker(
      new URL('../workers/colorSort.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<ColorSortWorkerResponse>) => {
      const msg = event.data
      if (msg.type !== 'SORT_RESULT') return
      if (msg.listVersion !== undefined && msg.listVersion !== listVersionRef.current) {
        return
      }

      const currentList = artworksRef.current
      const {
        targetId,
        mode: resultMode = 'hybrid',
        sortedIndices,
        distances,
        similarities,
        hasVisualEmbeddings,
        hasLayoutVectors,
      } = msg
      const currentGradeTuning = gradeTuningRef.current
      const currentLayoutTuning = layoutTuningRef.current
      const cacheKey = getCacheKey(targetId, resultMode, currentGradeTuning, currentLayoutTuning)
      pendingKeysRef.current.delete(cacheKey)

      if (sortedIndices.length !== currentList.length) {
        return
      }

      const len = sortedIndices.length
      const reconstructed: ScoredArtwork[] = new Array(len)
      for (let i = 0; i < len; i++) {
        const idx = sortedIndices[i]
        reconstructed[i] = {
          artwork: currentList[idx],
          distance: distances[i],
          similarityPercent: similarities[i],
        }
      }

      const isAnchorInList = currentList.some((a) => a.id === targetId)
      let finalScored = reconstructed
      const activeAnchor = anchorRef.current
      if (!isAnchorInList && activeAnchor && activeAnchor.id === targetId) {
        finalScored = [
          {
            artwork: activeAnchor,
            distance: 0,
            similarityPercent: 100,
          },
          ...reconstructed,
        ]
      }

      const listCache = getOrCreateCacheForList(currentList)
      if (listCache.size >= 24) {
        const oldestKey = listCache.keys().next().value
        if (oldestKey) listCache.delete(oldestKey)
      }
      listCache.set(cacheKey, finalScored)

      setWorkerResult({
        targetId,
        mode: resultMode,
        cacheKey,
        artworksList: currentList,
        scored: finalScored,
        hasVisualEmbeddings,
        hasLayoutVectors: hasLayoutVectors ?? false,
      })
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  // Sync compact color + style metadata to Worker whenever filteredArtworks changes
  React.useEffect(() => {
    listVersionRef.current++
    const version = listVersionRef.current
    artworksRef.current = filteredArtworks
    pendingKeysRef.current.clear()

    const worker = workerRef.current
    if (!worker || filteredArtworks.length === 0) return

    const firstId = filteredArtworks[0]?.id || ''
    const libKey = filteredArtworks[0]?.libraryId || (firstId.startsWith('google-flow-') ? 'google-flow' : 'design')
    void ensureEmbeddingsForLibrary(libKey)
    void ensureLayoutForLibrary(libKey)

    // Defer the heavy mapping and token extraction of 40,000+ items to the next event loop tick
    // so the browser can immediately render and paint the canvas and cards at 0ms latency!
    const timer = window.setTimeout(() => {
      if (version !== listVersionRef.current) return
      const compactItems = filteredArtworks.map((a) => ({
        id: a.id,
        dominantColor: a.dominantColor || '#18181b',
        palette: a.palette,
        paletteWeights: a.paletteWeights,
        splitToning: a.splitToning,
        aspectRatio: a.aspectRatio,
        tags: a.tags,
        tokens: extractStyleTokens(a),
      }))
      const payload: ColorSortWorkerRequest = {
        type: 'SET_ITEMS',
        items: compactItems,
        listVersion: version,
      }
      worker.postMessage(payload)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [filteredArtworks, ensureEmbeddingsForLibrary, ensureLayoutForLibrary])

  // Trigger off-thread Worker sort on pointerDown (before click completes) or when mode/tuning changes
  const prefetchAnchorSort = React.useCallback(
    async (
      target: Artwork,
      explicitMode?: SimilaritySortMode,
      explicitTuning?: GradeTuningOptions,
      explicitLayoutTuning?: LayoutTuningOptions
    ) => {
      const activeMode = explicitMode || modeRef.current
      const activeTuning = explicitTuning !== undefined ? explicitTuning : gradeTuningRef.current
      const activeLayoutTuning = explicitLayoutTuning !== undefined ? explicitLayoutTuning : layoutTuningRef.current
      const currentList = artworksRef.current
      const cacheKey = getCacheKey(target.id, activeMode, activeTuning, activeLayoutTuning)
      const listCache = getOrCreateCacheForList(currentList)
      if (listCache.has(cacheKey) || pendingKeysRef.current.has(cacheKey)) {
        return
      }
      const worker = workerRef.current
      if (!worker) return

      pendingKeysRef.current.add(cacheKey)

      const libKey =
        target.libraryId ||
        (target.id.startsWith('google-flow-')
          ? 'google-flow'
          : target.id.startsWith('design-')
          ? 'design'
          : currentList[0]?.libraryId || (currentList[0]?.id.startsWith('google-flow-') ? 'google-flow' : 'design'))

      if (activeMode === 'layout') {
        await ensureLayoutForLibrary(libKey)
      } else if (activeMode !== 'color' && activeMode !== 'grade') {
        await ensureEmbeddingsForLibrary(libKey)
      }

      const nextReqId = ++requestIdRef.current
      const payload: ColorSortWorkerRequest = {
        type: 'SORT_BY_ANCHOR',
        requestId: nextReqId,
        targetId: target.id,
        targetColor: target.dominantColor || '#ffffff',
        targetPalette: target.palette,
        targetPaletteWeights: target.paletteWeights,
        targetSplitToning: target.splitToning,
        targetGradeTuning: activeTuning,
        targetLayoutTuning: activeLayoutTuning,
        targetAspectRatio: target.aspectRatio,
        targetTags: target.tags,
        targetTokens: extractStyleTokens(target),
        mode: activeMode,
        listVersion: listVersionRef.current,
        targetEmbedding: target.embedding,
        targetLayoutVector: target.layoutVector,
        isTextAnchor: Boolean(target.isTextQuery || target.tags?.includes('clip-text-query')),
      }
      worker.postMessage(payload)
    },
    [ensureEmbeddingsForLibrary, ensureLayoutForLibrary]
  )

  // Request worker sort if colorAnchorArtwork, mode, or tuning changes and not yet cached
  React.useEffect(() => {
    if (!colorAnchorArtwork) return
    const cacheKey = getCacheKey(colorAnchorArtwork.id, mode, gradeTuning, layoutTuning)
    const listCache = getOrCreateCacheForList(filteredArtworks)
    if (!listCache.has(cacheKey)) {
      void prefetchAnchorSort(colorAnchorArtwork, mode, gradeTuning, layoutTuning)
    }
  }, [colorAnchorArtwork, mode, gradeTuning, layoutTuning, filteredArtworks, prefetchAnchorSort])

  const scoredArtworks = React.useMemo(() => {
    if (!colorAnchorArtwork) return []

    const cacheKey = getCacheKey(colorAnchorArtwork.id, mode, gradeTuning, layoutTuning)
    const listCache = getOrCreateCacheForList(filteredArtworks)
    const isAnchorInList = filteredArtworks.some((a) => a.id === colorAnchorArtwork.id)
    const expectedLen = isAnchorInList ? filteredArtworks.length : filteredArtworks.length + 1

    // 1. Check Worker pre-computed cache first (0.00ms on Main Thread!)
    const cached = listCache.get(cacheKey)
    if (cached && cached.length === expectedLen) {
      return cached
    }

    // 2. Check latest reactive Worker state
    if (
      workerResult &&
      workerResult.targetId === colorAnchorArtwork.id &&
      workerResult.mode === mode &&
      workerResult.cacheKey === cacheKey &&
      workerResult.artworksList === filteredArtworks
    ) {
      return workerResult.scored
    }

    // 3. Fallback synchronous computation while Worker finishes computing.
    // NOTE: this placeholder is NOT written to listCache — it is a color/grade approximation, and
    // caching it under a 'hybrid'/'visual'/'layout' key would make prefetchAnchorSort skip the
    // Worker, freezing those modes on the color ordering.
    if (colorAnchorArtwork.isTextQuery) {
      // A text query search has NO chromatic affinity: preserve existing list order until zero-shot embeddings return
      return filteredArtworks
    }
    if (mode === 'layout') {
      return sortArtworksByColorProximity(filteredArtworks, colorAnchorArtwork, 'color')
    }
    return sortArtworksByColorProximity(
      filteredArtworks,
      colorAnchorArtwork,
      mode === 'grade' ? 'grade' : 'color',
      gradeTuning
    )
  }, [colorAnchorArtwork, mode, gradeTuning, layoutTuning, filteredArtworks, workerResult])

  return {
    scoredArtworks,
    prefetchAnchorSort,
    hasVisualEmbeddings: workerResult?.hasVisualEmbeddings ?? false,
    hasLayoutVectors: workerResult?.hasLayoutVectors ?? false,
  }
}
