import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { computeClipVisualQuery, resolveEmbeddingsFilePath } from './clipQueryService'
import { getLibrariesConfig } from '../config/librariesConfig'

export interface IndexerStatus {
  state: 'idle' | 'indexing'
  libraryId: string | null
  processed: number
  total: number
  rateImgPerSec: number
}

class BackgroundIndexer {
  private status: IndexerStatus = {
    state: 'idle',
    libraryId: null,
    processed: 0,
    total: 0,
    rateImgPerSec: 0,
  }

  private isRunning = false
  private stopRequested = false

  getStatus(): IndexerStatus {
    return { ...this.status }
  }

  async startIndexing(libraryId: string, db: Database.Database): Promise<void> {
    if (this.isRunning) {
      return
    }

    this.isRunning = true
    this.stopRequested = false

    const configs = getLibrariesConfig()
    const config = configs.find(c => c.id === libraryId)
    const rootPath = config?.path || ''

    try {
      // Find items in library
      const rows = db.prepare(
        'SELECT id, thumb_rel_path, media_rel_path FROM items WHERE library_id = ? AND is_deleted = 0'
      ).all(libraryId) as { id: string; thumb_rel_path?: string; media_rel_path: string }[]

      this.status = {
        state: 'indexing',
        libraryId,
        processed: 0,
        total: rows.length,
        rateImgPerSec: 0,
      }

      const embFile = resolveEmbeddingsFilePath(libraryId) || path.resolve(process.cwd(), `.omnimage/embeddings/embeddings-${libraryId}.bin`)
      const embDir = path.dirname(embFile)
      if (!fs.existsSync(embDir)) {
        fs.mkdirSync(embDir, { recursive: true })
      }

      let existingVectors = 0
      if (fs.existsSync(embFile)) {
        const stat = fs.statSync(embFile)
        existingVectors = Math.floor(stat.size / 512)
      }

      const startTime = Date.now()

      for (let i = existingVectors; i < rows.length; i++) {
        if (this.stopRequested) break

        const item = rows[i]
        const thumbCandidate = item.thumb_rel_path
          ? path.resolve(rootPath, item.thumb_rel_path)
          : path.resolve(rootPath, item.media_rel_path)

        if (fs.existsSync(thumbCandidate)) {
          try {
            const buf = await fs.promises.readFile(thumbCandidate)
            const visual = await computeClipVisualQuery(buf)
            // Append 512-byte Int8 buffer to embeddings binary file
            await fs.promises.appendFile(embFile, Buffer.from(visual.embedding.buffer))
          } catch {
            // pad with zeros on unreadable image to maintain vector alignment
            await fs.promises.appendFile(embFile, Buffer.alloc(512))
          }
        } else {
          await fs.promises.appendFile(embFile, Buffer.alloc(512))
        }

        this.status.processed = i + 1
        const elapsedSec = (Date.now() - startTime) / 1000
        if (elapsedSec > 0) {
          this.status.rateImgPerSec = Number(((this.status.processed - existingVectors) / elapsedSec).toFixed(1))
        }

        // Allow I/O event loop ticks
        if (i % 25 === 0) {
          await new Promise(r => setImmediate(r))
        }
      }
    } catch (err) {
      console.warn('[BackgroundIndexer] Indexing error:', err)
    } finally {
      this.status.state = 'idle'
      this.isRunning = false
    }
  }

  stop(): void {
    if (this.isRunning) {
      this.stopRequested = true
    }
  }
}

export const backgroundIndexer = new BackgroundIndexer()
