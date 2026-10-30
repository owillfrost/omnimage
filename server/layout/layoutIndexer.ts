import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type Database from 'better-sqlite3'
import {
  LAYOUT_VECTOR_DIM,
  extractLayoutFromBuffer,
} from '../../src/core/layoutExtractor'
import {
  serializeLayoutBinary,
  parseLayoutBinary,
} from '../../src/contracts/binaryFormats'
import { getLibrariesConfig } from '../config/librariesConfig'
import { resolveMediaFilePath } from '../media/mediaStreamServer'

export interface LayoutIndexerStatus {
  state: 'idle' | 'indexing'
  libraryId: string | null
  processed: number
  total: number
  ratePerSec: number
}

// In-memory cache for fast binary layout streaming
interface LayoutCacheEntry {
  etag: string
  raw: Buffer
  gzip: Buffer
}

const layoutCache = new Map<string, LayoutCacheEntry>()

export function invalidateLayoutCache(libraryId?: string): void {
  if (libraryId) {
    layoutCache.delete(libraryId)
  } else {
    layoutCache.clear()
  }
}

export function resolveLayoutFilePath(libraryId: string): string {
  const fileName = `layout-${libraryId}.bin`
  const dir = path.resolve(process.cwd(), '.omnimage/layout')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return path.join(dir, fileName)
}

export class LayoutIndexer {
  private status: LayoutIndexerStatus = {
    state: 'idle',
    libraryId: null,
    processed: 0,
    total: 0,
    ratePerSec: 0,
  }

  private isRunning = false
  private stopRequested = false

  getStatus(): LayoutIndexerStatus {
    return { ...this.status }
  }

  stop(): void {
    if (this.isRunning) {
      this.stopRequested = true
    }
  }

  /**
   * Indexes layout vectors for all items in a library.
   * - Incremental: reads existing layout-${libraryId}.bin and only indexes new items.
   * - Fast: reads existing 640px/thumbnail WebP/PNG directly.
   * - Atomic: writes to .tmp before replacing binary file.
   */
  async startIndexing(
    libraryId: string,
    db: Database.Database,
    options: {
      onProgress?: (s: LayoutIndexerStatus) => void
      batchYield?: number
    } = {}
  ): Promise<{ total: number; newlyIndexed: number; existing: number; elapsedSec: number }> {
    if (this.isRunning) {
      throw new Error(`Layout indexer is already running for library ${this.status.libraryId}`)
    }

    this.isRunning = true
    this.stopRequested = false

    const batchYield = options.batchYield ?? 50
    const configs = getLibrariesConfig()
    const config = configs.find(c => c.id === libraryId)
    const rootPath = config?.path || ''

    const startTime = Date.now()

    try {
      // 1. Fetch all active items from SQLite
      const rows = db.prepare(
        'SELECT id, thumb_rel_path, media_rel_path FROM items WHERE library_id = ? AND is_deleted = 0 ORDER BY rowid ASC'
      ).all(libraryId) as Array<{ id: string; thumb_rel_path?: string; media_rel_path: string }>

      this.status = {
        state: 'indexing',
        libraryId,
        processed: 0,
        total: rows.length,
        ratePerSec: 0,
      }
      options.onProgress?.(this.getStatus())

      const filePath = resolveLayoutFilePath(libraryId)

      // 2. Load existing binary if present for incremental resume
      const existingIdMap = new Map<string, number>()
      let existingIds: string[] = []
      let existingVectors: Uint8Array = new Uint8Array(0)

      if (fs.existsSync(filePath)) {
        try {
          const rawBuf = fs.readFileSync(filePath)
          const ab = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength)
          const parsed = parseLayoutBinary(ab)
          existingIds = parsed.ids
          existingVectors = parsed.vectors
          for (let i = 0; i < existingIds.length; i++) {
            existingIdMap.set(existingIds[i], i)
          }
        } catch {
          // If file is corrupted, re-index cleanly
          existingIdMap.clear()
          existingIds = []
          existingVectors = new Uint8Array(0)
        }
      }

      const totalItems = rows.length
      const finalIds: string[] = new Array(totalItems)
      const finalVectors = new Uint8Array(totalItems * LAYOUT_VECTOR_DIM)

      let newlyIndexed = 0
      let reusedCount = 0

      for (let i = 0; i < totalItems; i++) {
        if (this.stopRequested) break

        const item = rows[i]
        finalIds[i] = item.id
        const destOffset = i * LAYOUT_VECTOR_DIM

        const existingIdx = existingIdMap.get(item.id)
        if (existingIdx !== undefined) {
          // Fast-copy already indexed vector
          const srcOffset = existingIdx * LAYOUT_VECTOR_DIM
          finalVectors.set(existingVectors.subarray(srcOffset, srcOffset + LAYOUT_VECTOR_DIM), destOffset)
          reusedCount++
        } else {
          // Resolve thumbnail on disk
          let thumbPath: string | null = null
          if (item.thumb_rel_path) {
            const candidate = rootPath ? path.resolve(rootPath, item.thumb_rel_path) : path.resolve(item.thumb_rel_path)
            if (fs.existsSync(candidate)) thumbPath = candidate
          }
          if (!thumbPath) {
            thumbPath = resolveMediaFilePath(libraryId, item.id, 'thumb', rootPath)
          }
          if (!thumbPath && item.media_rel_path) {
            const candidate = rootPath ? path.resolve(rootPath, item.media_rel_path) : path.resolve(item.media_rel_path)
            if (fs.existsSync(candidate)) thumbPath = candidate
          }

          if (thumbPath && fs.existsSync(thumbPath)) {
            try {
              const fileBuf = await fs.promises.readFile(thumbPath)
              const layoutRes = await extractLayoutFromBuffer(fileBuf)
              finalVectors.set(layoutRes.vector, destOffset)
              newlyIndexed++
            } catch {
              // Corrupted or unreadable image: fill with 0s to maintain alignment
              finalVectors.fill(0, destOffset, destOffset + LAYOUT_VECTOR_DIM)
            }
          } else {
            // Missing thumbnail: fill with 0s
            finalVectors.fill(0, destOffset, destOffset + LAYOUT_VECTOR_DIM)
          }
        }

        this.status.processed = i + 1
        const elapsed = (Date.now() - startTime) / 1000
        if (elapsed > 0) {
          this.status.ratePerSec = Number((newlyIndexed / elapsed).toFixed(1))
        }

        if ((i + 1) % batchYield === 0 || i + 1 === totalItems) {
          options.onProgress?.(this.getStatus())
          await new Promise(r => setImmediate(r))
        }
      }

      // 3. Atomically persist final binary file
      const finalArrayBuffer = serializeLayoutBinary(finalIds, finalVectors, LAYOUT_VECTOR_DIM)
      const tmpPath = `${filePath}.tmp.${Date.now()}`
      fs.writeFileSync(tmpPath, Buffer.from(finalArrayBuffer))
      fs.renameSync(tmpPath, filePath)

      invalidateLayoutCache(libraryId)

      const elapsedSec = Number(((Date.now() - startTime) / 1000).toFixed(1))
      return {
        total: totalItems,
        newlyIndexed,
        existing: reusedCount,
        elapsedSec,
      }
    } finally {
      this.status.state = 'idle'
      this.isRunning = false
    }
  }
}

export const layoutIndexer = new LayoutIndexer()

/**
 * High-performance binary HTTP stream handler for layout vectors with ETag and gzip.
 */
export async function handleLayoutBinaryStream(
  req: IncomingMessage,
  res: ServerResponse,
  libraryId: string
): Promise<void> {
  const filePath = resolveLayoutFilePath(libraryId)

  if (!filePath || !fs.existsSync(filePath)) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ status: 'not_indexed', library: libraryId }))
    return
  }

  const stat = await fs.promises.stat(filePath)
  const etag = `"layout-${libraryId}-${stat.size}-${stat.mtimeMs}"`

  res.setHeader('Cache-Control', 'public, max-age=60')
  res.setHeader('ETag', etag)
  res.setHeader('X-Layout-Dim', String(LAYOUT_VECTOR_DIM))
  res.setHeader('Content-Type', 'application/octet-stream')

  if (req.headers['if-none-match'] === etag) {
    res.statusCode = 304
    res.end()
    return
  }

  const acceptEncoding = String(req.headers['accept-encoding'] || '')
  const supportsGzip = acceptEncoding.includes('gzip')

  let entry = layoutCache.get(libraryId)
  if (!entry || entry.etag !== etag) {
    const raw = await fs.promises.readFile(filePath)
    const gzip = zlib.gzipSync(raw, { level: zlib.constants.Z_BEST_SPEED })
    entry = { etag, raw, gzip }
    layoutCache.set(libraryId, entry)
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
