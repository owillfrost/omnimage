import { quantizeNormalizedFloat32ToInt8 } from '../../../src/core/vectorQuantization'
import { extractPaletteFromRgba } from '../../../src/core/paletteExtractor'
import type { IEmbeddingEngine, TextQueryResult, VisualQueryResult } from './types'

let clipProcessor: any = null
let clipVisionModel: any = null
let clipVisionLoadingPromise: Promise<{ processor: any; visionModel: any }> | null = null

let clipTokenizer: any = null
let clipTextModel: any = null
let clipTextLoadingPromise: Promise<{ tokenizer: any; textModel: any }> | null = null

async function getClipVisionModel(): Promise<{ processor: any; visionModel: any }> {
  if (clipProcessor && clipVisionModel) {
    return { processor: clipProcessor, visionModel: clipVisionModel }
  }
  if (clipVisionLoadingPromise) return clipVisionLoadingPromise

  clipVisionLoadingPromise = (async () => {
    const { AutoProcessor, CLIPVisionModelWithProjection } = await import('@huggingface/transformers')
    clipProcessor = await AutoProcessor.from_pretrained('Xenova/clip-vit-base-patch32')
    clipVisionModel = await CLIPVisionModelWithProjection.from_pretrained(
      'Xenova/clip-vit-base-patch32',
      { dtype: 'fp32' }
    )
    return { processor: clipProcessor, visionModel: clipVisionModel }
  })()

  return clipVisionLoadingPromise
}

async function getClipTextModel(): Promise<{ tokenizer: any; textModel: any }> {
  if (clipTokenizer && clipTextModel) {
    return { tokenizer: clipTokenizer, textModel: clipTextModel }
  }
  if (clipTextLoadingPromise) return clipTextLoadingPromise

  clipTextLoadingPromise = (async () => {
    const { AutoTokenizer, CLIPTextModelWithProjection } = await import('@huggingface/transformers')
    clipTokenizer = await AutoTokenizer.from_pretrained('Xenova/clip-vit-base-patch32')
    clipTextModel = await CLIPTextModelWithProjection.from_pretrained(
      'Xenova/clip-vit-base-patch32',
      { dtype: 'fp32' }
    )
    return { tokenizer: clipTokenizer, textModel: clipTextModel }
  })()

  return clipTextLoadingPromise
}

export class ClipVitB32Engine implements IEmbeddingEngine {
  readonly id = 'clip-vit-b32'
  readonly name = 'CLIP ViT-B/32 (Standard)'
  readonly dim = 512

  async computeTextEmbedding(queryText: string): Promise<TextQueryResult> {
    const clean = queryText.trim()
    if (!clean) {
      throw new Error('Query text cannot be empty')
    }

    const { tokenizer, textModel } = await getClipTextModel()
    const inputs = await tokenizer([clean], { padding: true, truncation: true })
    const { text_embeds } = await textModel(inputs)
    const quantized = quantizeNormalizedFloat32ToInt8(text_embeds.data, 512)

    return {
      embedding: quantized,
      dim: 512,
    }
  }

  async computeVisualEmbedding(imageBuffer: Buffer): Promise<VisualQueryResult> {
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('Image buffer is empty')
    }

    const { RawImage } = await import('@huggingface/transformers')
    const { processor, visionModel } = await getClipVisionModel()

    const blob = new Blob([new Uint8Array(imageBuffer)])
    const rawImage = await RawImage.fromBlob(blob)

    const inputs = await processor(rawImage)
    const { image_embeds } = await visionModel(inputs)
    const quantized = quantizeNormalizedFloat32ToInt8(image_embeds.data, 512)

    const width = rawImage.width || 512
    const height = rawImage.height || 512
    const aspectRatio = Number((width / height).toFixed(3))
    const paletteData = extractPaletteFromRgba(rawImage.data, width, height, 5)

    return {
      embedding: quantized,
      width,
      height,
      aspectRatio,
      paletteData,
    }
  }
}
