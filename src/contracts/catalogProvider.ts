import type { Artwork } from '../types/artwork'
import type { SplitToningProfile } from '../core/paletteExtractor'
import type {
  LibrarySource,
  CatalogItemDetail,
  CatalogTaxonomyResponse,
  ItemMetadataPatch,
} from './schemas'

export interface ICatalogProvider {
  listLibraries(): Promise<LibrarySource[]>
  fetchArtworks(
    libraryId: string,
    options?: { limit?: number; query?: string; refresh?: boolean }
  ): Promise<Artwork[]>
  fetchTaxonomy(libraryId: string, refresh?: boolean): Promise<CatalogTaxonomyResponse | null>
  fetchItemDetail(libraryId: string, rawItemId: string): Promise<CatalogItemDetail | null>
  revealItemInExplorer(libraryId: string, rawItemId: string): Promise<{ ok: boolean; filePath?: string }>
  fetchEmbeddingsBinary(libraryId: string, engine?: string): Promise<{ dim: number; buffer: ArrayBuffer; engine?: string; isFallback?: boolean } | null>
  fetchLayoutBinary?(libraryId: string): Promise<{ dim: number; buffer: ArrayBuffer } | null>
  computeTextEmbedding(query: string): Promise<{ embedding: Int8Array; dim: number }>
  computeVisualQuery(input: {
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
  }>
  updateItemMetadata(libraryId: string, rawItemId: string, patch: ItemMetadataPatch): Promise<boolean>
  getMediaUrl(libraryId: string, rawItemId: string, type: 'thumb' | 'full'): string
  toggleLibraryVisibility?(libraryId: string, hidden: boolean): Promise<boolean>
  removeLibrary?(libraryId: string, options?: { deleteFilesOnDisk?: boolean }): Promise<boolean>
  scanLibraryFolder?(input: {
    libraryId: string
    folderPath: string
    importMode?: 'hardlink' | 'copy'
  }): Promise<{
    ok: boolean
    totalItems?: number
    newItems?: number
    libraryPath?: string
    error?: string
  }>
}
