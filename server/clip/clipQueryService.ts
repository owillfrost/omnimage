import type { IncomingMessage, ServerResponse } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { findCacheFile } from '../importers/eagleLibraryImporter'
import { getEmbeddingEngine } from './engines/engineRegistry'
import { getEmbeddingConfig, type EmbeddingEngineType } from '../config/embeddingConfig'
import type { TextQueryResult, VisualQueryResult } from './engines/types'

export type { TextQueryResult, VisualQueryResult }

export async function computeClipTextEmbedding(
  queryText: string,
  engineType?: EmbeddingEngineType
): Promise<TextQueryResult> {
  const engine = await getEmbeddingEngine(engineType)
  return engine.computeTextEmbedding(queryText)
}

export async function computeClipVisualQuery(
  imageBuffer: Buffer,
  engineType?: EmbeddingEngineType
): Promise<VisualQueryResult> {
  const engine = await getEmbeddingEngine(engineType)
  return engine.computeVisualEmbedding(imageBuffer)
}

// In-memory cache for fast binary embedding streaming
interface EmbeddingCacheEntry {
  etag: string
  raw: Buffer
  gzip: Buffer
}

const embeddingCache = new Map<string, EmbeddingCacheEntry>()

export function resolveEmbeddingsFilePath(
  libraryId: string,
  engineType?: EmbeddingEngineType
): string | null {
  const currentEngine = engineType || getEmbeddingConfig().engine
  const suffix = currentEngine === 'embeddinggemma-2' ? '.gemma2' : ''
  const fileName = `embeddings-${libraryId}${suffix}.bin`

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
  libraryId: string,
  engineType?: EmbeddingEngineType,
  db?: any
): Promise<void> {
  const activeEngine = engineType || getEmbeddingConfig().engine
  const filePath = resolveEmbeddingsFilePath(libraryId, activeEngine)

  if (!filePath || !fs.existsSync(filePath)) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ status: 'not_indexed', library: libraryId, engine: activeEngine }))
    return
  }

  const stat = await fs.promises.stat(filePath)
  const etag = `"emb-${libraryId}-${activeEngine}-${stat.size}-${stat.mtimeMs}"`

  res.setHeader('Cache-Control', 'public, max-age=60')
  res.setHeader('ETag', etag)
  res.setHeader('X-Embedding-Dim', '512')
  res.setHeader('X-Embedding-Engine', activeEngine)
  res.setHeader('Content-Type', 'application/octet-stream')

  if (req.headers['if-none-match'] === etag) {
    res.statusCode = 304
    res.end()
    return
  }

  const acceptEncoding = String(req.headers['accept-encoding'] || '')
  const supportsGzip = acceptEncoding.includes('gzip')

  const cacheKey = `${libraryId}-${activeEngine}`
  let entry = embeddingCache.get(cacheKey)
  if (!entry || entry.etag !== etag) {
    let raw = await fs.promises.readFile(filePath)

    // Check if the binary file lacks the 4-byte header length + JSON IDs prefix
    // (i.e. was indexed as a raw contiguous Int8 buffer in batch)
    if (raw.length >= 4) {
      const headerLen = raw.readUInt32LE(0)
      if (headerLen === 0 || 4 + headerLen > raw.length) {
        // Build the standard binary packaging format on-the-fly: [Uint32LE headerLen] + [UTF-8 JSON IDs] + [vectors]
        try {
          const sqliteDb = db || (await import('../db/sqliteClient')).getSqliteDb()
          const rows = sqliteDb.prepare(
            'SELECT id FROM items WHERE library_id = ? AND is_deleted = 0 ORDER BY rowid ASC'
          ).all(libraryId) as { id: string }[]

          const numVectors = Math.floor(raw.length / 512)
          const ids = rows.slice(0, numVectors).map(r => r.id)
          const headerBytes = Buffer.from(JSON.stringify(ids), 'utf-8')

          const packaged = Buffer.alloc(4 + headerBytes.length + raw.length)
          packaged.writeUInt32LE(headerBytes.length, 0)
          headerBytes.copy(packaged, 4)
          raw.copy(packaged, 4 + headerBytes.length)
          raw = packaged
        } catch (packErr) {
          console.warn('[handleEmbeddingsBinaryStream] Warning auto-packaging raw embeddings:', packErr)
        }
      }
    }

    const gzip = zlib.gzipSync(raw, { level: zlib.constants.Z_BEST_SPEED })
    entry = { etag, raw, gzip }
    embeddingCache.set(cacheKey, entry)
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
