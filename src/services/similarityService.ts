import type { Artwork } from '../types/artwork'
import type {
  ColorSortWorkerRequest,
  ColorSortWorkerResponse,
  SimilaritySortMode,
} from '../workers/colorSort.worker'
import { getCatalogProvider } from '../providers/providerFactory'

export type { SimilaritySortMode }

export interface SimilarItemsOptions {
  limit?: number
  excludeSelf?: boolean
  mode?: SimilaritySortMode
}

export interface SimilarItemsResult {
  items: Artwork[]
  hasVisualEmbeddings: boolean
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

class SimilarityWorkerManager {
  private worker: Worker | null = null
  private currentItemsRef: Artwork[] = []
  private itemsSynced = false
  private loadedEmbeddingLibraries = new Set<string>()
  private loadingEmbeddingPromises = new Map<string, Promise<boolean>>()
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
        const { requestId, targetId, sortedIndices, hasVisualEmbeddings } = msg
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

        resolver({ items: result, hasVisualEmbeddings })
      }
    } catch (err) {
      console.error('Failed to initialize similarity worker:', err)
    }
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
    mode: SimilaritySortMode = 'hybrid'
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
        targetAspectRatio: targetArtwork.aspectRatio,
        targetTags: targetArtwork.tags,
        targetTokens: extractStyleTokens(targetArtwork),
        mode,
        targetEmbedding: targetArtwork.embedding,
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
  const { limit = 20, mode = 'hybrid' } = options
  const cacheKey = `${targetArtwork.id}:${mode}`

  const cached = SIMILARITY_CACHE.get(cacheKey)
  if (cached) {
    return {
      items: cached.items.slice(0, limit),
      hasVisualEmbeddings: cached.hasVisualEmbeddings,
    }
  }

  similarityManager.syncItems(allArtworks)

  if (mode !== 'color') {
    const libKey = targetArtwork.libraryId || (targetArtwork.id.startsWith('google-flow-')
      ? 'google-flow'
      : targetArtwork.id.startsWith('design-')
      ? 'design'
      : (allArtworks[0]?.libraryId || (allArtworks[0]?.id.startsWith('google-flow-') ? 'google-flow' : 'design')))
    await similarityManager.ensureEmbeddingsLoaded(libKey)
  }

  const result = await similarityManager.computeSimilarity(targetArtwork, mode)

  if (SIMILARITY_CACHE.size >= MAX_CACHE_SIZE) {
    const firstKey = SIMILARITY_CACHE.keys().next().value
    if (firstKey) SIMILARITY_CACHE.delete(firstKey)
  }
  SIMILARITY_CACHE.set(cacheKey, result)

  return {
    items: result.items.slice(0, limit),
    hasVisualEmbeddings: result.hasVisualEmbeddings,
  }
}

export const getSimilarItemsWithMeta = getSimilarArtworks
