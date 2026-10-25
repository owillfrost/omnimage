import type { IncomingMessage, ServerResponse } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { quantizeNormalizedFloat32ToInt8 } from '../../src/core/vectorQuantization'
import { extractPaletteFromRgba, type ExtractedPalette } from '../../src/core/paletteExtractor'
import { findCacheFile } from '../importers/eagleLibraryImporter'

// Lazy-loaded model singletons
let clipProcessor: any = null
let clipVisionModel: any = null
let clipVisionLoadingPromise: Promise<{ processor: any; visionModel: any }> | null = null

let clipTokenizer: any = null
let clipTextModel: any = null
let clipTextLoadingPromise: Promise<{ tokenizer: any; textModel: any }> | null = null

export async function getClipVisionModel(): Promise<{ processor: any; visionModel: any }> {
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

export async function getClipTextModel(): Promise<{ tokenizer: any; textModel: any }> {
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

export async function computeClipTextEmbedding(
  queryText: string
): Promise<{ embedding: Int8Array; dim: number }> {
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

export async function computeClipVisualQuery(imageBuffer: Buffer): Promise<{
  embedding: Int8Array
  width: number
  height: number
  aspectRatio: number
  paletteData: ExtractedPalette
}> {
  if (!imageBuffer || imageBuffer.length === 0) {
    throw new Error('Image buffer is empty')
  }

  const { RawImage } = await import('@huggingface/transformers')
  const { processor, visionModel } = await getClipVisionModel()

  const blob = new Blob([imageBuffer])
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

// In-memory cache for fast binary embedding streaming
interface EmbeddingCacheEntry {
  etag: string
  raw: Buffer
  gzip: Buffer
}

const embeddingCache = new Map<string, EmbeddingCacheEntry>()

export function resolveEmbeddingsFilePath(libraryId: string): string | null {
  const fileName = `embeddings-${libraryId}.bin`
  // 1. Look into .omnimage/embeddings/ (or fallback .cosmos/embeddings/)
  const omnimagePath = path.resolve(process.cwd(), '.omnimage/embeddings', fileName)
  if (fs.existsSync(omnimagePath)) {
    return omnimagePath
  }
  const legacyPath = path.resolve(process.cwd(), '.cosmos/embeddings', fileName)
  if (fs.existsSync(legacyPath)) {
    return legacyPath
  }

  // 2. Look in findCacheFile
  const cached = findCacheFile(fileName)
  if (cached && fs.existsSync(cached)) {
    return cached
  }

  return null
}

export async function handleEmbeddingsBinaryStream(
  req: IncomingMessage,
  res: ServerResponse,
  libraryId: string
): Promise<void> {
  const filePath = resolveEmbeddingsFilePath(libraryId)

  if (!filePath || !fs.existsSync(filePath)) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ status: 'not_indexed', library: libraryId }))
    return
  }

  const stat = await fs.promises.stat(filePath)
  const etag = `"emb-${libraryId}-${stat.size}-${stat.mtimeMs}"`

  res.setHeader('Cache-Control', 'public, max-age=60')
  res.setHeader('ETag', etag)
  res.setHeader('X-Embedding-Dim', '512')
  res.setHeader('Content-Type', 'application/octet-stream')

  if (req.headers['if-none-match'] === etag) {
    res.statusCode = 304
    res.end()
    return
  }

  const acceptEncoding = String(req.headers['accept-encoding'] || '')
  const supportsGzip = acceptEncoding.includes('gzip')

  let entry = embeddingCache.get(libraryId)
  if (!entry || entry.etag !== etag) {
    const raw = await fs.promises.readFile(filePath)
    const gzip = zlib.gzipSync(raw, { level: zlib.constants.Z_BEST_SPEED })
    entry = { etag, raw, gzip }
    embeddingCache.set(libraryId, entry)
  }

  if (supportsGzip) {
    res.setHeader('Content-Encoding', 'gzip')
    res.setHeader('Content-Length', entry.gzip.length)
    res.end(entry.gzip)
  } else {
    res.setHeader('Content-Length', entry.raw.length)
    res.end(entry.raw)
  }
}
