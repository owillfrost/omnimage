import type { ExtractedPalette } from '../../../src/core/paletteExtractor'

export interface VisualQueryResult {
  embedding: Int8Array
  width: number
  height: number
  aspectRatio: number
  paletteData: ExtractedPalette
}

export interface TextQueryResult {
  embedding: Int8Array
  dim: number
}

export interface IEmbeddingEngine {
  readonly id: string
  readonly name: string
  readonly dim: number

  computeTextEmbedding(queryText: string): Promise<TextQueryResult>
  computeVisualEmbedding(imageBuffer: Buffer): Promise<VisualQueryResult>
}
