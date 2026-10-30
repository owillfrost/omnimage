import type { ICatalogProvider } from '../contracts/catalogProvider'
import type {
  LibrarySource,
  CatalogItemDetail,
  CatalogTaxonomyResponse,
  ItemMetadataPatch,
} from '../contracts/schemas'
import type { Artwork } from '../types/artwork'
import { buildArtworkColorVectors } from '../core/colorClustering'

/**
 * Lean Web OPFS & Local File Provider.
 * Allows running the Omnimage visual catalog inside any standard modern web browser.
 * If the user opens a folder that was already indexed by Omnimage Desktop (.omnimage/ present),
 * it reads library.json, sidecars, and embeddings directly from the browser file handle!
 */
export class WebOpfsProvider implements ICatalogProvider {
  private activeDirectoryHandle: FileSystemDirectoryHandle | null = null
  private objectUrlCache = new Map<string, string>()
  private inMemoryArtworks: Artwork[] = []
  private inMemoryTaxonomy: CatalogTaxonomyResponse | null = null
  private embeddingsBuffer: ArrayBuffer | null = null

  async setDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    this.activeDirectoryHandle = handle
    this.clearObjectUrls()
    await this.scanDirectoryHandle(handle)
  }

  clearObjectUrls(): void {
    for (const url of this.objectUrlCache.values()) {
      URL.revokeObjectURL(url)
    }
    this.objectUrlCache.clear()
  }

  async listLibraries(): Promise<LibrarySource[]> {
    if (this.activeDirectoryHandle) {
      return [
        {
          id: 'web-local',
          name: this.activeDirectoryHandle.name,
          path: this.activeDirectoryHandle.name,
          type: 'native-folder',
          itemCount: this.inMemoryArtworks.length,
          indexedEmbeddingCount: this.embeddingsBuffer ? Math.floor(this.embeddingsBuffer.byteLength / 512) : 0,
        },
      ]
    }

    return [
      {
        id: 'web-empty',
        name: 'Abrir Pasta Local no Navegador...',
        path: '',
        type: 'native-folder',
        itemCount: 0,
        indexedEmbeddingCount: 0,
      },
    ]
  }

  async fetchArtworks(
    _libraryId: string,
    options: { limit?: number; query?: string; refresh?: boolean } = {}
  ): Promise<Artwork[]> {
    let list = this.inMemoryArtworks

    if (options.query?.trim()) {
      const q = options.query.trim().toLowerCase()
      list = list.filter(art => {
        const titleMatch = art.title.toLowerCase().includes(q)
        const tagsMatch = art.tags?.some(t => t.toLowerCase().includes(q))
        const annotMatch = art.culture?.toLowerCase().includes(q)
        return titleMatch || tagsMatch || annotMatch
      })
    }

    if (options.limit && options.limit > 0) {
      return list.slice(0, options.limit)
    }

    return list
  }

  async fetchTaxonomy(_libraryId: string): Promise<CatalogTaxonomyResponse | null> {
    return this.inMemoryTaxonomy
  }

  async fetchItemDetail(_libraryId: string, rawItemId: string): Promise<CatalogItemDetail | null> {
    const found = this.inMemoryArtworks.find(a => (a.rawId || a.id) === rawItemId)
    if (!found) return null

    return {
      id: found.rawId || found.id,
      name: found.title,
      ext: found.ext || 'jpg',
      width: found.width,
      height: found.height,
      annotation: found.culture,
      url: found.url,
      tags: found.tags,
      folders: found.folders,
      filePath: found.imageUrl || '',
    }
  }

  async revealItemInExplorer(_libraryId: string, _rawItemId: string): Promise<{ ok: boolean; filePath?: string }> {
    // Browsers cannot execute native file explorer reveal
    return { ok: false }
  }

  async fetchEmbeddingsBinary(_libraryId: string, _engine?: string): Promise<{ dim: number; buffer: ArrayBuffer; engine?: string; isFallback?: boolean } | null> {
    if (this.embeddingsBuffer) {
      return { dim: 512, buffer: this.embeddingsBuffer }
    }
    return null
  }

  async fetchLayoutBinary(_libraryId: string): Promise<{ dim: number; buffer: ArrayBuffer } | null> {
    return null
  }

  async computeTextEmbedding(_query: string): Promise<{ embedding: Int8Array; dim: number }> {
    throw new Error('In-browser text embedding requires WebGPU/WASM pipeline or backend server.')
  }

  async computeVisualQuery(_input: any): Promise<{
    embedding: Int8Array
    width: number
    height: number
    aspectRatio: number
    dominantColor: string
    palette: string[]
    paletteWeights: number[]
  }> {
    throw new Error('In-browser visual query requires backend server.')
  }

  async updateItemMetadata(_libraryId: string, rawItemId: string, patch: ItemMetadataPatch): Promise<boolean> {
    const art = this.inMemoryArtworks.find(a => (a.rawId || a.id) === rawItemId)
    if (!art) return false

    if (patch.name !== undefined) art.title = patch.name
    if (patch.annotation !== undefined) art.culture = patch.annotation
    if (patch.url !== undefined) art.url = patch.url
    if (patch.tags !== undefined) {
      art.tags = patch.tags
      art.artist = patch.tags.join(', ')
    }
    return true
  }

  getMediaUrl(_libraryId: string, rawItemId: string, type: 'thumb' | 'full'): string {
    const cached = this.objectUrlCache.get(`${rawItemId}:${type}`)
    if (cached) return cached

    const fallback = this.objectUrlCache.get(`${rawItemId}:full`)
    if (fallback) return fallback

    return ''
  }

  private async scanDirectoryHandle(dirHandle: FileSystemDirectoryHandle): Promise<void> {
    const artworks: Artwork[] = []
    const BASE_WIDTH = 260

    try {
      // Check for .omnimage/ (or legacy .cosmos/)
      let omnimageHandle: FileSystemDirectoryHandle | null = null
      try {
        omnimageHandle = await dirHandle.getDirectoryHandle('.omnimage')
      } catch {
        try {
          omnimageHandle = await dirHandle.getDirectoryHandle('.cosmos')
        } catch {
          omnimageHandle = null
        }
      }

      if (omnimageHandle) {
        // Read library.json
        try {
          const libFile = await omnimageHandle.getFileHandle('library.json')
          const file = await libFile.getFile()
          const text = await file.text()
          this.inMemoryTaxonomy = JSON.parse(text)
        } catch {
          // ignore
        }

        // Read embeddings
        try {
          const embDir = await omnimageHandle.getDirectoryHandle('embeddings')
          // Look for any .bin
          for await (const [name, handle] of (embDir as any).entries()) {
            if (name.endsWith('.bin') && handle.kind === 'file') {
              const f = await handle.getFile()
              this.embeddingsBuffer = await f.arrayBuffer()
              break
            }
          }
        } catch {
          // ignore
        }
      }

      // Read image/video files
      for await (const [name, handle] of (dirHandle as any).entries()) {
        if (handle.kind === 'file') {
          const ext = name.split('.').pop()?.toLowerCase() || ''
          if (['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg', 'mp4', 'webm', 'mov'].includes(ext)) {
            const file: File = await handle.getFile()
            const objectUrl = URL.createObjectURL(file)
            const id = name.replace(/[^a-zA-Z0-9]/g, '_')

            this.objectUrlCache.set(`${id}:full`, objectUrl)
            this.objectUrlCache.set(`${id}:thumb`, objectUrl)

            const dominantColor = '#18181b'
            const palette = ['#18181b']
            const colorVectors = buildArtworkColorVectors(dominantColor, palette)

            artworks.push({
              id: `web-${id}`,
              rawId: id,
              libraryId: 'web-local',
              title: name,
              artist: dirHandle.name,
              date: new Date(file.lastModified).toLocaleDateString(),
              btime: file.lastModified,
              medium: `${ext.toUpperCase()} • Local File`,
              source: dirHandle.name,
              sourceUrl: '#',
              imageUrl: objectUrl,
              thumbnailUrl: objectUrl,
              aspectRatio: 1.0,
              dominantColor,
              palette,
              paletteWeights: [1],
              colorVectors,
              searchText: name.toLowerCase(),
              ext,
              mediaType: ['mp4', 'webm', 'mov'].includes(ext) ? 'video' : 'image',
              worldX: 0,
              worldY: 0,
              width: BASE_WIDTH,
              height: BASE_WIDTH,
            })
          }
        }
      }
    } catch (err) {
      console.warn('[WebOpfsProvider] Scan error:', err)
    }

    this.inMemoryArtworks = artworks
  }
}
