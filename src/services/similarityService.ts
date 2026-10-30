import type { Artwork } from '../types/artwork'
import type {
  ColorSortWorkerRequest,
  ColorSortWorkerResponse,
  SimilaritySortMode,
} from '../workers/colorSort.worker'
import type { GradeTuningOptions } from '../core/colorClustering'
import type { LayoutTuningOptions } from '../core/layoutExtractor'
import { getCatalogProvider } from '../providers/providerFactory'

export type { SimilaritySortMode }
export type { GradeTuningOptions }
export type { LayoutTuningOptions }

export interface SimilarItemsOptions {
  limit?: number
  excludeSelf?: boolean
  mode?: SimilaritySortMode
  gradeTuning?: GradeTuningOptions
  layoutTuning?: LayoutTuningOptions
}

export interface SimilarItemsResult {
  items: Artwork[]
  hasVisualEmbeddings: boolean
  hasLayoutVectors?: boolean
}

// In-memory LRU cache storing the last 60 calculated similarity arrays keyed by `${targetId}:${mode}`
const SIMILARITY_CACHE = new Map<string, SimilarItemsResult>()
const MAX_CACHE_SIZE = 60

function extractStyleTokens(artwork: Artwork): string[] {
  const rawText = `${artwork.title || ''} ${artwork.culture && artwork.culture !== 'Local Asset' ? artwork.culture : ''}`
  const matches = rawText.toLowerCase().match(/[a-z0-9à-ú]{3,20}/g)
  if (!matches) return []
  // Deduplicate and cap at 24 tokens per item to keep Worker memory minimal
  return Array.from(new Set(matches)).slice(0, 24)
}

function buildCacheKey(
  targetId: string,
  mode: SimilaritySortMode,
  gradeTuning?: GradeTuningOptions,
  layoutTuning?: LayoutTuningOptions
): string {
  if (mode === 'grade' && gradeTuning) {
    const bal = gradeTuning.balance ?? 0
    const s = gradeTuning.shadowOverride ? `${gradeTuning.shadowOverride.a},${gradeTuning.shadowOverride.b}` : ''
    const h = gradeTuning.highlightOverride ? `${gradeTuning.highlightOverride.a},${gradeTuning.highlightOverride.b}` : ''
    const sens = gradeTuning.sensitivity ?? 0.75
    const skin = gradeTuning.protectSkinTones ?? true ? '1' : '0'
    const neut = gradeTuning.excludeNeutrals ? '1' : '0'
    return `${targetId}:grade:b${bal}:s${s}:h${h}:se${sens}:sk${skin}:n${neut}`
  }
  if (mode === 'layout' && layoutTuning) {
    const w = layoutTuning.aspectWeight ?? 0.15
    const sens = layoutTuning.sensitivity ?? 1.0
    return `${targetId}:layout:w${w}:se${sens}`
  }
  return `${targetId}:${mode}`
}

class SimilarityWorkerManager {
  private worker: Worker | null = null
  private currentItemsRef: Artwork[] = []
  private itemsSynced = false
  private loadedEmbeddingLibraries = new Set<string>()
  private loadingEmbeddingPromises = new Map<string, Promise<boolean>>()
  private loadedLayoutLibraries = new Set<string>()
  private loadingLayoutPromises = new Map<string, Promise<boolean>>()
  private requestId = 0
  private pendingResolvers = new Map<number, (res: SimilarItemsResult) => void>()

  private initWorker() {
    if (this.worker || typeof window === 'undefined') return
    try {
      this.worker = new Worker(
        new URL('../workers/colorSort.worker.ts', import.meta.url),
        { type: 'module' }
      )
      this.worker.onmessage = (event: MessageEvent<ColorSortWorkerResponse>) => {
        const msg = event.data
        if (msg.type !== 'SORT_RESULT') return
        const { requestId, targetId, sortedIndices, hasVisualEmbeddings, hasLayoutVectors } = msg
        const resolver = this.pendingResolvers.get(requestId)
        if (!resolver) return
        this.pendingResolvers.delete(requestId)

        const all = this.currentItemsRef
        const result: Artwork[] = []
        for (let i = 0; i < sortedIndices.length; i++) {
          const item = all[sortedIndices[i]]
          if (item && item.id !== targetId) {
            result.push(item)
          }
        }

        resolver({ items: result, hasVisualEmbeddings, hasLayoutVectors })
      }
    } catch (err) {
      console.error('Failed to initialize similarity worker:', err)
    }
  }

  public async ensureLayoutLoaded(libraryKey: string): Promise<boolean> {
    if (this.loadedLayoutLibraries.has(libraryKey)) return true
    const existingPromise = this.loadingLayoutPromises.get(libraryKey)
    if (existingPromise) return existingPromise

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
        const vectors = new Uint8Array(buffer, 4 + headerByteLen)

        this.initWorker()
        if (!this.worker) return false

        this.worker.postMessage({
          type: 'SET_LAYOUT_VECTORS',
          library: libraryKey,
          dim,
          ids,
          vectors,
        } as ColorSortWorkerRequest)

        this.loadedLayoutLibraries.add(libraryKey)
        SIMILARITY_CACHE.clear()
        return true
      } catch {
        return false
      } finally {
        this.loadingLayoutPromises.delete(libraryKey)
      }
    })()

    this.loadingLayoutPromises.set(libraryKey, promise)
    return promise
  }

  public async ensureEmbeddingsLoaded(libraryKey: string): Promise<boolean> {
    if (this.loadedEmbeddingLibraries.has(libraryKey)) return true
    const existingPromise = this.loadingEmbeddingPromises.get(libraryKey)
    if (existingPromise) return existingPromise

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
        const vectors = new Int8Array(buffer, 4 + headerByteLen)

        this.initWorker()
        if (!this.worker) return false

        this.worker.postMessage({
          type: 'SET_EMBEDDINGS',
          library: libraryKey,
          dim,
          ids,
          vectors,
        } as ColorSortWorkerRequest)

        this.loadedEmbeddingLibraries.add(libraryKey)
        SIMILARITY_CACHE.clear()
        return true
      } catch {
        return false
      } finally {
        this.loadingEmbeddingPromises.delete(libraryKey)
      }
    })()

    this.loadingEmbeddingPromises.set(libraryKey, promise)
    return promise
  }

  public syncItems(items: Artwork[]) {
    if (this.currentItemsRef === items && this.itemsSynced) return
    this.currentItemsRef = items
    this.initWorker()
    if (!this.worker) return

    const compact = items.map(a => ({
      id: a.id,
      dominantColor: a.dominantColor || '#18181b',
      palette: a.palette,
      paletteWeights: a.paletteWeights,
      splitToning: a.splitToning,
      aspectRatio: a.aspectRatio,
      tags: a.tags,
      tokens: extractStyleTokens(a),
    }))

    this.worker.postMessage({
      type: 'SET_ITEMS',
      items: compact,
    } as ColorSortWorkerRequest)

    this.itemsSynced = true
  }

  public computeSimilarity(
    targetArtwork: Artwork,
    mode: SimilaritySortMode = 'hybrid',
    gradeTuning?: GradeTuningOptions,
    layoutTuning?: LayoutTuningOptions
  ): Promise<SimilarItemsResult> {
    return new Promise((resolve) => {
      this.initWorker()
      if (!this.worker) {
        resolve({ items: [], hasVisualEmbeddings: false })
        return
      }

      const reqId = ++this.requestId
      this.pendingResolvers.set(reqId, resolve)

      const payload: ColorSortWorkerRequest = {
        type: 'SORT_BY_ANCHOR',
        requestId: reqId,
        targetId: targetArtwork.id,
        targetColor: targetArtwork.dominantColor || '#ffffff',
        targetPalette: targetArtwork.palette,
        targetPaletteWeights: targetArtwork.paletteWeights,
        targetSplitToning: targetArtwork.splitToning,
        targetGradeTuning: gradeTuning,
        targetLayoutTuning: layoutTuning,
        targetAspectRatio: targetArtwork.aspectRatio,
        targetTags: targetArtwork.tags,
        targetTokens: extractStyleTokens(targetArtwork),
        mode,
        targetEmbedding: targetArtwork.embedding,
        targetLayoutVector: targetArtwork.layoutVector,
        isTextAnchor: Boolean(targetArtwork.isTextQuery || targetArtwork.tags?.includes('clip-text-query')),
      }

      this.worker.postMessage(payload)
    })
  }
}

const similarityManager = new SimilarityWorkerManager()

export async function getSimilarArtworks(
  targetArtwork: Artwork,
  allArtworks: Artwork[],
  options: SimilarItemsOptions = {}
): Promise<SimilarItemsResult> {
  const { limit = 20, mode = 'hybrid', gradeTuning, layoutTuning } = options
  const cacheKey = buildCacheKey(targetArtwork.id, mode, gradeTuning, layoutTuning)

  const cached = SIMILARITY_CACHE.get(cacheKey)
  if (cached) {
    return {
      items: cached.items.slice(0, limit),
      hasVisualEmbeddings: cached.hasVisualEmbeddings,
      hasLayoutVectors: cached.hasLayoutVectors,
    }
  }

  similarityManager.syncItems(allArtworks)

  if (mode === 'layout') {
    const libKey = targetArtwork.libraryId || (targetArtwork.id.startsWith('google-flow-')
      ? 'google-flow'
      : targetArtwork.id.startsWith('design-')
      ? 'design'
      : (allArtworks[0]?.libraryId || (allArtworks[0]?.id.startsWith('google-flow-') ? 'google-flow' : 'design')))
    await similarityManager.ensureLayoutLoaded(libKey)
  } else if (mode !== 'color' && mode !== 'grade') {
    const libKey = targetArtwork.libraryId || (targetArtwork.id.startsWith('google-flow-')
      ? 'google-flow'
      : targetArtwork.id.startsWith('design-')
      ? 'design'
      : (allArtworks[0]?.libraryId || (allArtworks[0]?.id.startsWith('google-flow-') ? 'google-flow' : 'design')))
    await similarityManager.ensureEmbeddingsLoaded(libKey)
  }

  const result = await similarityManager.computeSimilarity(targetArtwork, mode, gradeTuning, layoutTuning)

  if (SIMILARITY_CACHE.size >= MAX_CACHE_SIZE) {
    const firstKey = SIMILARITY_CACHE.keys().next().value
    if (firstKey) SIMILARITY_CACHE.delete(firstKey)
  }
  SIMILARITY_CACHE.set(cacheKey, result)

  return {
    items: result.items.slice(0, limit),
    hasVisualEmbeddings: result.hasVisualEmbeddings,
    hasLayoutVectors: result.hasLayoutVectors,
  }
}

export const getSimilarItemsWithMeta = getSimilarArtworks
