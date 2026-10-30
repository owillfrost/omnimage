import { quantizeNormalizedFloat32ToInt8 } from '../../../src/core/vectorQuantization'
import { extractPaletteFromRgba } from '../../../src/core/paletteExtractor'
import type { IEmbeddingEngine, TextQueryResult, VisualQueryResult } from './types'

let textPipeline: any = null
let textPipelinePromise: Promise<any> | null = null

const GEMMA_MODEL_ID = 'onnx-community/embeddinggemma-2-ONNX'

/**
 * Normalizes and truncates a vector to 512 dimensions using Matryoshka Representation Learning (MRL),
 * then quantizes to Int8 [-127, 127] for 100% binary compatibility with Omnimage's 120 FPS workers.
 */
export function processMatryoshka512(rawVector: Float32Array | number[] | ArrayLike<number>): Int8Array {
  // 1. Truncate 768d -> 512d
  const sliced = new Float32Array(512)
  for (let i = 0; i < 512; i++) {
    sliced[i] = rawVector[i] || 0
  }

  // 2. Re-apply L2 normalization (mandatory mathematically for MRL slices)
  let norm = 0
  for (let i = 0; i < 512; i++) {
    norm += sliced[i] * sliced[i]
  }
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < 512; i++) {
    sliced[i] /= norm
  }

  // 3. Quantize normalized Float32 into Int8 Array (512 bytes)
  return quantizeNormalizedFloat32ToInt8(sliced, 512)
}

function resolveDevice(device: 'cpu' | 'directml' | 'cuda' | 'auto'): 'dml' | 'cpu' {
  if (device === 'directml' || device === 'cuda') return 'dml'
  if (device === 'cpu') return 'cpu'
  // Auto: default to dml on Windows if available, else cpu
  return process.platform === 'win32' ? 'dml' : 'cpu'
}

async function getTextPipeline(device: 'cpu' | 'directml' | 'cuda' | 'auto') {
  if (textPipeline) return textPipeline
  if (textPipelinePromise) return textPipelinePromise

  textPipelinePromise = (async () => {
    const { pipeline } = await import('@huggingface/transformers')
    const targetDevice = resolveDevice(device)
    textPipeline = await pipeline('feature-extraction', GEMMA_MODEL_ID, {
      device: targetDevice,
      dtype: 'q4',
    })
    return textPipeline
  })()

  return textPipelinePromise
}

export class Gemma2Engine implements IEmbeddingEngine {
  readonly id = 'embeddinggemma-2'
  readonly name = 'EmbeddingGemma 2 (Pro Neural 512d)'
  readonly dim = 512

  private device: 'cpu' | 'directml' | 'cuda' | 'auto'

  constructor(device: 'cpu' | 'directml' | 'cuda' | 'auto' = 'auto') {
    this.device = device
  }

  async computeTextEmbedding(queryText: string): Promise<TextQueryResult> {
    const clean = queryText.trim()
    if (!clean) {
      throw new Error('Query text cannot be empty')
    }

    const formattedQuery = clean.startsWith('task:') ? clean : `task: search query | query: ${clean}`
    const extractor = await getTextPipeline(this.device)

    const output = await extractor(formattedQuery, {
      pooling: 'mean',
      normalize: true,
    })

    const rawData = output.data || (output[0]?.data) || output
    const quantized512 = processMatryoshka512(rawData)

    return {
      embedding: quantized512,
      dim: 512,
    }
  }

  async computeVisualEmbedding(imageBuffer: Buffer): Promise<VisualQueryResult> {
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('Image buffer is empty')
    }

    const { RawImage, AutoProcessor, AutoModel } = await import('@huggingface/transformers')
    const blob = new Blob([new Uint8Array(imageBuffer)])
    const rawImage = await RawImage.fromBlob(blob)

    const targetDevice = resolveDevice(this.device)
    const processor = await AutoProcessor.from_pretrained(GEMMA_MODEL_ID)
    const visionModel = await AutoModel.from_pretrained(GEMMA_MODEL_ID, {
      device: targetDevice,
      dtype: 'q4',
    })

    const inputs = await processor(rawImage)
    const outputs = await visionModel(inputs)

    const imageEmbeds = outputs.image_embeds || outputs.sentence_embedding || outputs.last_hidden_state
    const rawData = imageEmbeds.data || imageEmbeds[0]?.data || imageEmbeds

    const quantized512 = processMatryoshka512(rawData)

    const width = rawImage.width || 512
    const height = rawImage.height || 512
    const aspectRatio = Number((width / height).toFixed(3))
    const paletteData = extractPaletteFromRgba(rawImage.data, width, height, 5)

    return {
      embedding: quantized512,
      width,
      height,
      aspectRatio,
      paletteData,
    }
  }
}
