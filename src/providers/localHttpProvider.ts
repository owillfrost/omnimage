import type { ICatalogProvider } from '../contracts/catalogProvider'
import type {
  LibrarySource,
  CatalogItemDetail,
  CatalogTaxonomyResponse,
  ItemMetadataPatch,
  CompactCatalogItem,
} from '../contracts/schemas'
import type { Artwork } from '../types/artwork'
import type { SplitToningProfile } from '../core/paletteExtractor'
import { buildArtworkColorVectors } from '../core/colorClustering'

function rgbToHex(rgb?: [number, number, number]): string {
  if (!rgb || rgb.length < 3) return '#18181b'
  const r = Math.min(255, Math.max(0, Math.round(rgb[0])))
  const g = Math.min(255, Math.max(0, Math.round(rgb[1])))
  const b = Math.min(255, Math.max(0, Math.round(rgb[2])))
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

export class LocalHttpProvider implements ICatalogProvider {
  private baseUrl: string

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl
  }

  async listLibraries(): Promise<LibrarySource[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/catalog/libraries`)
      if (res.ok) {
        const json = await res.json()
        if (json.status === 'success' && Array.isArray(json.data)) {
          return json.data
        }
      }
    } catch {
      // Fallback below
    }

    // Default fallback sources
    return [
      {
        id: 'design',
        name: 'Design.library',
        path: '',
        type: 'eagle-library',
        itemCount: 29252,
        indexedEmbeddingCount: 29252,
      },
      {
        id: 'google-flow',
        name: 'Google Flow + Prompts',
        path: '',
        type: 'eagle-library',
        itemCount: 12932,
        indexedEmbeddingCount: 12932,
      },
    ]
  }

  async fetchArtworks(
    libraryId: string,
    options: { limit?: number; query?: string; refresh?: boolean } = {}
  ): Promise<Artwork[]> {
    const limit = options.limit ?? 50000
    const params = new URLSearchParams({
      library: libraryId,
      limit: String(limit),
    })
    if (options.query?.trim()) {
      params.set('q', options.query.trim())
    }
    if (options.refresh) {
      params.set('refresh', '1')
    }

    let items: (CompactCatalogItem & { annotation?: string; btime?: number; mtime?: number })[] = []

    try {
      const res = await fetch(`${this.baseUrl}/api/catalog/items?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        if (json.status === 'success' && Array.isArray(json.data)) {
          items = json.data
        }
      }
    } catch (err) {
      console.error('Failed to fetch catalog items:', err)
      return []
    }

    const BASE_WIDTH = 260
    const libLabel = libraryId === 'google-flow' ? 'Google Flow + Prompts' : `${libraryId}.library`
    const artworks: Artwork[] = new Array(items.length)
    let writeIdx = 0

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item.id || !item.name) continue

      const rawAspect = item.width && item.height ? item.width / item.height : 1.0
      const aspectRatio = Math.max(0.6, Math.min(1.8, rawAspect))
      const height = Math.round(BASE_WIDTH / aspectRatio)

      const rawPalettes = item.palettes?.slice(0, 5)
      const dominantColor = rgbToHex(rawPalettes?.[0]?.color)
      const palette = rawPalettes?.length ? rawPalettes.map(p => rgbToHex(p.color)) : [dominantColor]

      let paletteWeights: number[] | undefined
      if (rawPalettes && rawPalettes.length > 0) {
        let totalRatio = 0
        const rawRatios = rawPalettes.map(p => {
          const r = typeof p.ratio === 'number' && p.ratio > 0 ? p.ratio : 1
          totalRatio += r
          return r
        })
        paletteWeights = totalRatio > 0
          ? rawRatios.map(r => r / totalRatio)
          : rawRatios.map(() => 1 / rawRatios.length)
      }

      const colorVectors = buildArtworkColorVectors(dominantColor, palette)
      const tagsStr = item.tags && item.tags.length > 0 ? item.tags.join(' ') : ''
      const annotStr = item.annotation ? item.annotation : ''
      const searchText = `${item.name || ''} ${tagsStr} ${annotStr}`.toLowerCase()
      const extLower = (item.ext || '').toLowerCase()
      const isVideo = ['mp4', 'webm', 'mov'].includes(extLower)
      const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image'

      const hasAnnot = item.hasAnnotation ?? Boolean(item.annotation && item.annotation.trim().length > 0)
      const annotPreview = item.annotationPreview ?? (item.annotation ? item.annotation.slice(0, 160) : undefined)

      artworks[writeIdx++] = {
        id: `${libraryId}-${item.id}`,
        rawId: item.id,
        libraryId,
        title: item.name,
        artist: item.tags?.length ? item.tags.join(', ') : libLabel,
        date: item.btime ? new Date(item.btime).toLocaleDateString() : 'Recent',
        btime: item.btime,
        mtime: item.mtime,
        medium: `${(item.ext || '').toUpperCase()} • ${item.width || '?'}x${item.height || '?'}`,
        source: libLabel,
        sourceUrl: item.url || '#',
        url: item.url,
        imageUrl: this.getMediaUrl(libraryId, item.id, 'full'),
        thumbnailUrl: this.getMediaUrl(libraryId, item.id, 'thumb'),
        aspectRatio,
        dominantColor,
        palette,
        paletteWeights,
        splitToning: item.splitToning,
        tags: item.tags,
        folders: item.folders,
        colorVectors,
        searchText,
        ext: item.ext,
        mediaType,
        duration: typeof item.duration === 'number' ? item.duration : undefined,
        department: item.tags?.slice(0, 2).join(', '),
        culture: item.annotation || 'Local Asset',
        hasAnnotation: hasAnnot,
        annotationPreview: annotPreview,
        // Only keep full annotation if it's already short; long prompts are fetched on demand
        annotation: item.annotation && item.annotation.length <= 256 ? item.annotation : undefined,
        worldX: 0,
        worldY: 0,
        width: BASE_WIDTH,
        height,
      }
    }

    artworks.length = writeIdx
    return artworks
  }

  async fetchTaxonomy(libraryId: string, refresh = false): Promise<CatalogTaxonomyResponse | null> {
    try {
      const params = new URLSearchParams({ library: libraryId })
      if (refresh) params.set('refresh', '1')

      const res = await fetch(`${this.baseUrl}/api/catalog/taxonomy?${params.toString()}`)
      if (!res.ok) return null

      const json = await res.json()
      if (json.status !== 'success') return null
      return json as CatalogTaxonomyResponse
    } catch (err) {
      console.error('Failed to load taxonomy:', err)
      return null
    }
  }

  async fetchItemDetail(libraryId: string, rawItemId: string): Promise<CatalogItemDetail | null> {
    try {
      const params = new URLSearchParams({ library: libraryId, id: rawItemId })
      const res = await fetch(`${this.baseUrl}/api/catalog/item-detail?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        if (json.status === 'success' && json.data) {
          return json.data as CatalogItemDetail
        }
      }
    } catch (err) {
      console.warn('Failed to fetch detailed item data:', err)
    }
    return null
  }

  async revealItemInExplorer(libraryId: string, rawItemId: string): Promise<{ ok: boolean; filePath?: string }> {
    try {
      const params = new URLSearchParams({ library: libraryId, id: rawItemId })
      const res = await fetch(`${this.baseUrl}/api/catalog/reveal?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        return { ok: Boolean(json.ok), filePath: json.filePath }
      }
    } catch {
      // ignore
    }
    return { ok: false }
  }

  async fetchEmbeddingsBinary(
    libraryId: string,
    engine?: string
  ): Promise<{ dim: number; buffer: ArrayBuffer; engine?: string } | null> {
    try {
      const params = new URLSearchParams({ library: libraryId })
      if (engine) {
        params.set('engine', engine)
      }
      const res = await fetch(`${this.baseUrl}/api/catalog/embeddings?${params.toString()}`)
      if (!res.ok) return null

      const dimHeader = res.headers.get('X-Embedding-Dim')
      const engineHeader = res.headers.get('X-Embedding-Engine') || engine
      const dim = dimHeader ? parseInt(dimHeader, 10) : 512
      const buffer = await res.arrayBuffer()
      return { dim, buffer, engine: engineHeader }
    } catch (err) {
      console.error('Failed to fetch embeddings binary:', err)
      return null
    }
  }

  async fetchLayoutBinary(libraryId: string): Promise<{ dim: number; buffer: ArrayBuffer } | null> {
    try {
      const params = new URLSearchParams({ library: libraryId })
      const res = await fetch(`${this.baseUrl}/api/catalog/layout-vectors?${params.toString()}`)
      if (!res.ok) return null

      const dimHeader = res.headers.get('X-Layout-Dim')
      const dim = dimHeader ? parseInt(dimHeader, 10) : 288
      const buffer = await res.arrayBuffer()
      return { dim, buffer }
    } catch (err) {
      console.error('Failed to fetch layout binary:', err)
      return null
    }
  }

  async computeTextEmbedding(query: string): Promise<{ embedding: Int8Array; dim: number }> {
    const res = await fetch(`${this.baseUrl}/api/catalog/clip-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) {
      throw new Error(`Text embedding failed with status ${res.status}`)
    }
    const json = await res.json()
    return {
      embedding: new Int8Array(json.embedding),
      dim: json.dim || 512,
    }
  }

  async computeVisualQuery(input: {
    file?: File | Blob
    dataUrl?: string
    url?: string
  }): Promise<{
    embedding: Int8Array
    width: number
    height: number
    aspectRatio: number
    dominantColor: string
    palette: string[]
    paletteWeights: number[]
    splitToning?: SplitToningProfile
  }> {
    const formData = new FormData()
    if (input.file) {
      formData.append('image', input.file)
    } else if (input.dataUrl) {
      formData.append('dataUrl', input.dataUrl)
    } else if (input.url) {
      formData.append('url', input.url)
    }

    const res = await fetch(`${this.baseUrl}/api/catalog/clip-visual`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      throw new Error(`Visual query failed with status ${res.status}`)
    }
    const json = await res.json()
    return {
      embedding: new Int8Array(json.embedding),
      width: json.width || 512,
      height: json.height || 512,
      aspectRatio: json.aspectRatio || 1,
      dominantColor: json.dominantColor || '#18181b',
      palette: json.palette || ['#18181b'],
      paletteWeights: json.paletteWeights || [1],
      splitToning: json.splitToning,
    }
  }

  async updateItemMetadata(
    libraryId: string,
    rawItemId: string,
    patch: ItemMetadataPatch
  ): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/catalog/item-metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ library: libraryId, id: rawItemId, patch }),
      })
      if (res.ok) {
        const json = await res.json()
        return json.status === 'success'
      }
    } catch (err) {
      console.error('Failed to update item metadata:', err)
    }
    return false
  }

  getMediaUrl(libraryId: string, rawItemId: string, type: 'thumb' | 'full'): string {
    return `${this.baseUrl}/api/catalog/media?library=${encodeURIComponent(libraryId)}&id=${encodeURIComponent(rawItemId)}&type=${type}`
  }

  async toggleLibraryVisibility(libraryId: string, hidden: boolean): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/catalog/libraries`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraryId, hidden }),
      })
      if (res.ok) {
        const json = await res.json()
        return json.status === 'success'
      }
    } catch (err) {
      console.error('Failed to toggle library visibility:', err)
    }
    return false
  }

  async removeLibrary(
    libraryId: string,
    options: { deleteFilesOnDisk?: boolean } = {}
  ): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/catalog/libraries`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          libraryId,
          deleteFilesOnDisk: Boolean(options.deleteFilesOnDisk),
        }),
      })
      if (res.ok) {
        const json = await res.json()
        return json.status === 'success'
      }
    } catch (err) {
      console.error('Failed to remove library:', err)
    }
    return false
  }

  async scanLibraryFolder(input: {
    libraryId: string
    folderPath: string
    importMode?: 'hardlink' | 'copy'
  }): Promise<{
    ok: boolean
    totalItems?: number
    newItems?: number
    libraryPath?: string
    error?: string
  }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/catalog/scan-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const json = await res.json()
      if (res.ok && json.status === 'success') {
        return {
          ok: true,
          totalItems: json.totalItems,
          newItems: json.newItems,
          libraryPath: json.libraryPath,
        }
      }
      return { ok: false, error: json.error || 'Falha ao criar/indexar .library' }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Erro de conexão com o servidor' }
    }
  }
}
