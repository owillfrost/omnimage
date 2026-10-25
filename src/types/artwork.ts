export interface Artwork {
  id: string
  title: string
  artist: string
  date: string
  medium: string
  source: string
  sourceUrl: string
  imageUrl: string
  thumbnailUrl: string
  aspectRatio: number // width / height
  dominantColor: string
  palette: string[]
  /**
   * Proportional coverage weights (normalized to sum ~1.0) for each color in `palette`.
   */
  paletteWeights?: number[]
  /**
   * Raw tags array for stylistic/semantic overlap scoring.
   */
  tags?: string[]
  /**
   * Folder / collection IDs array indicating which collections this item belongs to.
   */
  folders?: string[]
  /**
   * Pre-computed contiguous [L, a, b, h, s] tuples (5 floats per color: dominantColor + palette)
   * for zero-allocation perceptual color filtering across 40,000+ items.
   */
  colorVectors?: Float32Array
  /**
   * Quantized CLIP ViT-B/32 Int8 embedding (512 dimensions in [-127..127]),
   * used directly for external ephemeral anchors or deep similarity queries.
   */
  embedding?: Int8Array | number[]
  /**
   * Indicates whether this artwork is an external ephemeral query anchor (reverse image search or CLIP text query).
   */
  isEphemeral?: boolean
  /**
   * Indicates whether this ephemeral anchor represents a zero-shot CLIP natural text query.
   */
  isTextQuery?: boolean
  dimensions?: string
  department?: string
  culture?: string
  searchText?: string
  ext?: string
  mediaType?: 'image' | 'video'
  duration?: number
  btime?: number
  mtime?: number
  contentHash?: string
  rawId?: string
  libraryId?: string
  /**
   * Compact metadata indicator: true if this item has an annotation/prompt.
   */
  hasAnnotation?: boolean
  /**
   * Short preview of prompt/annotation (up to 160 chars) for lightweight list views.
   */
  annotationPreview?: string
  /**
   * Full annotation / prompt string loaded on demand via fetchItemDetail.
   */
  annotation?: string
  url?: string
  // 2D Spatial world coordinates
  worldX: number
  worldY: number
  width: number
  height: number
}

export interface ViewportState {
  x: number
  y: number
  scale: number
}
