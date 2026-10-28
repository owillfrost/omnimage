import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import type Database from 'better-sqlite3'
import { CatalogRepository } from './catalogRepository'
import { getLibrariesConfig } from '../config/librariesConfig'
import {
  extractSplitToningFromRgba,
  deriveFallbackSplitToningFromPalette,
  type SplitToningProfile,
} from '../../src/core/paletteExtractor'

export interface MigrationProgress {
  libraryId: string
  totalToMigrate: number
  processed: number
  updated: number
  fromThumbnail: number
  fromFallback: number
  ratePerSec: number
  isDone: boolean
}

export class SplitToningMigrationService {
  private repo: CatalogRepository
  private db: Database.Database
  private isRunning = false
  private stopRequested = false
  private currentProgress: MigrationProgress | null = null

  constructor(db: Database.Database) {
    this.db = db
    this.repo = new CatalogRepository(db)
  }

  getProgress(): MigrationProgress | null {
    return this.currentProgress
  }

  stop(): void {
    if (this.isRunning) {
      this.stopRequested = true
    }
  }

  /**
   * Migrates existing indexed items in SQLite that lack a split_toning profile.
   * Processes in fast chunks of 250 items:
   * - Reads existing 640px/128px thumbnail from disk and extracts SplitToningProfile in ~0.5ms.
   * - Falls back to palette derivation if thumbnail file is missing.
   * - Updates SQLite split_toning_json and compact_json in an atomic batch.
   */
  async runMigration(
    libraryId: string,
    options: { batchSize?: number; onProgress?: (p: MigrationProgress) => void } = {}
  ): Promise<{ processed: number; updated: number; fromThumb: number; fromFallback: number }> {
    if (this.isRunning) {
      throw new Error(`Migration already running for library ${this.currentProgress?.libraryId}`)
    }

    this.isRunning = true
    this.stopRequested = false

    const batchSize = options.batchSize || 200
    const configs = getLibrariesConfig()
    const config = configs.find(c => c.id === libraryId)
    let rootPath = config?.path || ''
    if (!rootPath) {
      const libRow = this.db.prepare('SELECT root_path FROM libraries WHERE id = ?').get(libraryId) as { root_path: string } | undefined
      rootPath = libRow?.root_path || ''
    }

    let totalProcessed = 0
    let totalUpdated = 0
    let countThumb = 0
    let countFallback = 0

    // Count items needing migration
    const countRow = this.db.prepare(`
      SELECT COUNT(*) as count FROM items
      WHERE library_id = ? AND split_toning_json IS NULL AND is_deleted = 0
    `).get(libraryId) as { count: number } | undefined

    const totalToMigrate = countRow?.count || 0
    const startTime = Date.now()

    this.currentProgress = {
      libraryId,
      totalToMigrate,
      processed: 0,
      updated: 0,
      fromThumbnail: 0,
      fromFallback: 0,
      ratePerSec: 0,
      isDone: false,
    }

    try {
      while (!this.stopRequested) {
        const pending = this.repo.getItemsPendingSplitToning(libraryId, batchSize)
        if (pending.length === 0) break

        const updates: Array<{ id: string; splitToning: SplitToningProfile }> = []

        for (const item of pending) {
          if (this.stopRequested) break

          // 1. Try to resolve thumbnail file path
          let thumbPath = item.thumbRelPath ? path.resolve(rootPath, item.thumbRelPath) : null
          if (!thumbPath || !fs.existsSync(thumbPath)) {
            // Check Eagle conventions: images/{id}.info/_thumbnail.webp or _thumbnail.png
            const eagleWebp = path.join(rootPath, 'images', `${item.id}.info`, '_thumbnail.webp')
            const eaglePng = path.join(rootPath, 'images', `${item.id}.info`, '_thumbnail.png')
            if (fs.existsSync(eagleWebp)) {
              thumbPath = eagleWebp
            } else if (fs.existsSync(eaglePng)) {
              thumbPath = eaglePng
            } else {
              const fullMedia = path.resolve(rootPath, item.mediaRelPath)
              if (fs.existsSync(fullMedia)) {
                thumbPath = fullMedia
              } else {
                thumbPath = null
              }
            }
          }

          let profile: SplitToningProfile | null = null

          if (thumbPath && fs.existsSync(thumbPath)) {
            try {
              const { data, info } = await sharp(thumbPath)
                .rotate()
                .resize({
                  width: 128,
                  height: 128,
                  fit: 'cover',
                })
                .ensureAlpha()
                .raw()
                .toBuffer({ resolveWithObject: true })

              profile = extractSplitToningFromRgba(data, info.width, info.height)
              countThumb++
            } catch {
              profile = null
            }
          }

          // 2. Fallback to palette extraction if thumbnail was not accessible
          if (!profile) {
            let palette: string[] = ['#18181b']
            let weights: number[] | undefined = undefined
            if (item.paletteJson) {
              try {
                const parsed = JSON.parse(item.paletteJson)
                if (Array.isArray(parsed) && parsed.length > 0) {
                  if (typeof parsed[0] === 'string') {
                    palette = parsed
                  } else if (parsed[0]?.color) {
                    palette = parsed.map((p: any) => {
                      const [r, g, b] = p.color
                      return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`
                    })
                    weights = parsed.map((p: any) => (p.ratio || 1) / 100)
                  }
                }
              } catch {
                // keep fallback
              }
            }
            profile = deriveFallbackSplitToningFromPalette(palette, weights)
            countFallback++
          }

          updates.push({ id: item.id, splitToning: profile })
          totalProcessed++
        }

        if (updates.length > 0) {
          const changed = this.repo.updateSplitToningBatch(libraryId, updates)
          totalUpdated += changed
        }

        const elapsedSec = (Date.now() - startTime) / 1000
        const ratePerSec = elapsedSec > 0 ? Number((totalProcessed / elapsedSec).toFixed(1)) : 0

        this.currentProgress = {
          libraryId,
          totalToMigrate,
          processed: totalProcessed,
          updated: totalUpdated,
          fromThumbnail: countThumb,
          fromFallback: countFallback,
          ratePerSec,
          isDone: totalProcessed >= totalToMigrate,
        }

        options.onProgress?.(this.currentProgress)

        // Yield to Node event loop
        await new Promise(r => setImmediate(r))
      }
    } finally {
      this.isRunning = false
      if (this.currentProgress) {
        this.currentProgress.isDone = true
      }
    }

    return {
      processed: totalProcessed,
      updated: totalUpdated,
      fromThumb: countThumb,
      fromFallback: countFallback,
    }
  }
}
