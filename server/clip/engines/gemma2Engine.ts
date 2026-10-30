import { quantizeNormalizedFloat32ToInt8 } from '../../../src/core/vectorQuantization'
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
    try {
      const { pipeline } = await import('@huggingface/transformers')
      const targetDevice = resolveDevice(device)
      try {
        textPipeline = await pipeline('feature-extraction', GEMMA_MODEL_ID, {
          device: targetDevice,
          dtype: 'q4',
        })
      } catch (deviceErr) {
        if (targetDevice !== 'cpu') {
          console.warn('[Gemma2Engine] Hardware acceleration failed, falling back to CPU:', deviceErr)
          textPipeline = await pipeline('feature-extraction', GEMMA_MODEL_ID, {
            device: 'cpu',
            dtype: 'q4',
          })
        } else {
          throw deviceErr
        }
      }
      return textPipeline
    } catch (err) {
      textPipelinePromise = null
      throw err
    }
  })()

  return textPipelinePromise
}

export class Gemma2Engine implements IEmbeddingEngine {
  readonly id = 'embeddinggemma-2'
  readonly name = 'EmbeddingGemma 2 (Pro Neural 512d)'
  readonly dim = 512
  readonly modality = 'text' as const

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
      truncation: true,
      max_length: 128,
    })

    const rawData = output.data || (output[0]?.data) || output
    const quantized512 = processMatryoshka512(rawData)

    return {
      embedding: quantized512,
      dim: 512,
    }
  }

  async computeBatchTextEmbeddings(texts: string[]): Promise<Int8Array[]> {
    if (texts.length === 0) return []
    const extractor = await getTextPipeline(this.device)
    const formatted = texts.map((t) => {
      const clean = t.trim()
      return clean.startsWith('title:') || clean.startsWith('task:')
        ? clean
        : `title: none | text: ${clean || 'untitled'}`
    })

    const output = await extractor(formatted, {
      pooling: 'mean',
      normalize: true,
      truncation: true,
      max_length: 128,
    })

    const results: Int8Array[] = []
    const data = output.data
    const dims = output.dims // [batchSize, dim]
    if (dims && dims.length === 2) {
      const batchSize = dims[0]
      const hiddenDim = dims[1]
      for (let b = 0; b < batchSize; b++) {
        const slice = data.subarray(b * hiddenDim, (b + 1) * hiddenDim)
        results.push(processMatryoshka512(slice))
      }
    } else if (Array.isArray(output)) {
      for (const item of output) {
        results.push(processMatryoshka512(item.data))
      }
    } else if (data) {
      results.push(processMatryoshka512(data))
    }

    return results
  }

  async computeVisualEmbedding(_imageBuffer: Buffer): Promise<VisualQueryResult> {
    throw new Error(
      'Gemma2Engine is a text embedding model and does not process raw pixel images. Use ClipVitB32Engine for visual image embeddings.'
    )
  }
}
