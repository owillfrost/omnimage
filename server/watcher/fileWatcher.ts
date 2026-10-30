import chokidar, { type FSWatcher } from 'chokidar'
import path from 'node:path'
import fs from 'node:fs'
import type Database from 'better-sqlite3'
import { CatalogRepository, invalidateCatalogCache } from '../db/catalogRepository'
import { SidecarManager, type ItemSidecarMetadata } from '../sidecar/sidecarManager'
import { computeFileContentHash, generateItemId } from '../media/contentHasher'
import { generateImageThumbnailAndPalette } from '../media/thumbnailGenerator'
import { generateVideoThumbnailAndPalette } from '../media/videoThumbnailer'
import { linkOrCopyFile, resolveTargetLibraryPath, type EagleItemMetadataJson } from '../importers/folderScanner'
import { clearMediaPathCache } from '../media/mediaStreamServer'
import { extractComfyMetadataFromPngFile } from '../metadata/comfyPngParser'
import { getLibrariesConfig } from '../config/librariesConfig'
import type { CompactCatalogItem } from '../../src/contracts/schemas'

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'svg', 'bmp'])
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'm4v'])

export function normalizePaletteToEagle(
  rawPalette: unknown[],
  rawWeights?: number[]
): Array<{ color: [number, number, number]; ratio: number }> {
  if (!Array.isArray(rawPalette) || rawPalette.length === 0) {
    return [{ color: [24, 24, 27], ratio: 100 }]
  }

  return rawPalette.slice(0, 5).map((entry: any, i) => {
    let r = 24, g = 24, b = 27
    let ratio = Math.max(1, Math.round(((rawWeights && rawWeights[i]) || 1) * 100))

    if (entry && typeof entry === 'object' && Array.isArray(entry.color)) {
      r = Number(entry.color[0]) || 0
      g = Number(entry.color[1]) || 0
      b = Number(entry.color[2]) || 0
      if (typeof entry.ratio === 'number') ratio = entry.ratio
    } else if (typeof entry === 'string') {
      const clean = entry.replace('#', '')
      if (clean.length >= 6) {
        r = parseInt(clean.slice(0, 2), 16) || 0
        g = parseInt(clean.slice(2, 4), 16) || 0
        b = parseInt(clean.slice(4, 6), 16) || 0
      }
    }
    return { color: [r, g, b] as [number, number, number], ratio }
  })
}

export function eaglePaletteToHexStrings(
  eaglePalettes: Array<{ color: [number, number, number]; ratio: number }> | string[]
): string[] {
  if (!Array.isArray(eaglePalettes)) return ['#18181b']
  return eaglePalettes.map((item: any) => {
    if (typeof item === 'string') return item.startsWith('#') ? item : `#${item}`
    if (item && Array.isArray(item.color)) {
      const [r, g, b] = item.color
      return `#${((1 << 24) + ((r & 255) << 16) + ((g & 255) << 8) + (b & 255)).toString(16).slice(1).toUpperCase()}`
    }
    return '#18181b'
  })
}

interface RecentDeletion {
  id: string
  name: string
  libraryId: string
  contentHash: string
  tags?: string[]
  folders?: string[]
  annotation?: string
  dominantColor?: string
  palette?: string[]
  paletteWeights?: number[]
  timestamp: number
  deleteTimeout?: NodeJS.Timeout
}

export class LibraryFileWatcher {
  private watchers = new Map<string, FSWatcher>()
  private recentDeletions = new Map<string, RecentDeletion>()
  private sourcePathToItemId = new Map<string, string>()
  private db: Database.Database
  private repo: CatalogRepository

  constructor(db: Database.Database) {
    this.db = db
    this.repo = new CatalogRepository(db)

    // Cleanup stale deletions periodically
    setInterval(() => {
      const now = Date.now()
      for (const [key, del] of this.recentDeletions.entries()) {
        if (now - del.timestamp > 35000) {
          if (del.deleteTimeout) {
            clearTimeout(del.deleteTimeout)
          }
          this.recentDeletions.delete(key)
        }
      }
    }, 15000)
  }

  startWatching(libraryId: string, watchFolderPath: string, targetLibraryPath?: string): void {
    if (this.watchers.has(libraryId)) {
      return
    }

    const libraryRootPath = resolveTargetLibraryPath(libraryId, watchFolderPath, targetLibraryPath)
    const sidecarMgr = new SidecarManager(libraryRootPath)

    const watcher = chokidar.watch(watchFolderPath, {
      ignored: [
        /(^|[/\\])\../, // ignore hidden files and dotfolders
        '**/.omnimage/**',
        '**/.cosmos/**',
        '**/*.library/**',
        '**/*.info/**',
        '**/node_modules/**',
        '**/.git/**',
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 200,
      },
    })

    watcher.on('add', async (filePath) => {
      try {
        const ext = path.extname(filePath).toLowerCase().replace(/^\./, '')
        if (!IMAGE_EXTS.has(ext) && !VIDEO_EXTS.has(ext)) return

        const stat = await fs.promises.stat(filePath)
        const contentHash = await computeFileContentHash(filePath, stat.size)

        // Check if this was a rename/move from recently deleted item
        const recent = this.recentDeletions.get(contentHash)
        let itemId: string
        let tags: string[] = []
        let folders: string[] = []
        let annotation = ''
        let dominantColor = '#18181b'
        let palette: any[] = ['#18181b']
        let paletteWeights: number[] = [1]
        let width = 640
        let height = 640

        if (recent) {
          if (recent.deleteTimeout) {
            clearTimeout(recent.deleteTimeout)
          }
          itemId = recent.id
          tags = recent.tags || []
          folders = recent.folders || []
          annotation = recent.annotation || ''
          dominantColor = recent.dominantColor || '#18181b'
          palette = recent.palette || ['#18181b']
          paletteWeights = recent.paletteWeights || [1]
          this.recentDeletions.delete(contentHash)
        } else {
          itemId = generateItemId()
        }

        const normPath = path.resolve(filePath).toLowerCase()
        this.sourcePathToItemId.set(normPath, itemId)

        const nameWithoutExt = path.basename(filePath, path.extname(filePath))
        const safeFileName = `${nameWithoutExt}.${ext}`

        // Build Eagle-style {libraryRootPath}/images/{itemId}.info/
        const infoDir = path.join(libraryRootPath, 'images', `${itemId}.info`)
        if (!fs.existsSync(infoDir)) {
          fs.mkdirSync(infoDir, { recursive: true })
        }

        // Clean up old media files in .info if this was a rename to avoid multi-media accumulation
        if (recent) {
          try {
            const files = fs.readdirSync(infoDir)
            for (const f of files) {
              const lower = f.toLowerCase()
              if (
                !lower.endsWith('_thumbnail.webp') &&
                !lower.endsWith('_thumbnail.png') &&
                !lower.endsWith('metadata.json') &&
                f !== safeFileName
              ) {
                try {
                  fs.unlinkSync(path.join(infoDir, f))
                } catch {
                  // ignore
                }
              }
            }
          } catch {
            // ignore
          }
        }

        const targetMediaPath = path.join(infoDir, safeFileName)
        const targetThumbPath = path.join(infoDir, '_thumbnail.webp')
        const targetMetaPath = path.join(infoDir, 'metadata.json')

        linkOrCopyFile(filePath, targetMediaPath, 'hardlink')

        if (!fs.existsSync(targetThumbPath)) {
          const isVideo = VIDEO_EXTS.has(ext)
          try {
            const thumbResult = isVideo
              ? await generateVideoThumbnailAndPalette(filePath, targetThumbPath)
              : await generateImageThumbnailAndPalette(filePath, targetThumbPath)
            width = thumbResult.width
            height = thumbResult.height
            dominantColor = thumbResult.dominantColor
            palette = thumbResult.palette
            paletteWeights = thumbResult.paletteWeights
          } catch {
            // ignore
          }
        }

        const btime = Math.floor(stat.birthtimeMs || stat.mtimeMs)
        const mtime = Math.floor(stat.mtimeMs)
        if (!annotation && ext === 'png') {
          const comfy = extractComfyMetadataFromPngFile(filePath)
          if (comfy?.positivePrompt) {
            annotation = comfy.positivePrompt
          }
        }
        const hasAnnot = Boolean(annotation && annotation.trim().length > 0)

        // Resilient palette conversion without TypeError
        const eaglePalettes = normalizePaletteToEagle(palette, paletteWeights)
        const hexPalette = eaglePaletteToHexStrings(eaglePalettes)

        // Save Eagle metadata.json inside .info folder
        const eagleMeta: EagleItemMetadataJson = {
          id: itemId,
          name: nameWithoutExt,
          size: stat.size,
          btime,
          mtime,
          ext,
          tags,
          folders,
          isDeleted: false,
          url: '',
          annotation,
          modificationTime: Date.now(),
          width,
          height,
          palettes: eaglePalettes,
          contentHash,
        }
        const tmpMetaPath = `${targetMetaPath}.tmp`
        fs.writeFileSync(tmpMetaPath, JSON.stringify(eagleMeta, null, 2), 'utf-8')
        fs.renameSync(tmpMetaPath, targetMetaPath)

        const mediaRelPath = `images/${itemId}.info/${safeFileName}`
        const thumbRelPath = `images/${itemId}.info/_thumbnail.webp`

        // Write sidecar
        const sidecarMeta: ItemSidecarMetadata = {
          id: itemId,
          name: nameWithoutExt,
          ext,
          width,
          height,
          dominantColor,
          palette: hexPalette,
          paletteWeights,
          tags: tags.length > 0 ? tags : undefined,
          folders: folders.length > 0 ? folders : undefined,
          annotation: annotation || undefined,
          contentHash,
          relativePath: mediaRelPath,
          mediaRelPath,
          thumbRelPath,
          btime,
          mtime,
        }
        sidecarMgr.saveItemSidecar(sidecarMeta)

        // Compact JSON
        const compact: CompactCatalogItem = {
          id: itemId,
          name: nameWithoutExt,
          ext,
          width,
          height,
          btime,
          tags: tags.length > 0 ? tags : undefined,
          folders: folders.length > 0 ? folders : undefined,
          hasAnnotation: hasAnnot ? true : undefined,
          palettes: eaglePalettes.slice(0, 4),
        }

        // Insert into SQLite
        this.repo.insertItemsBatch(libraryId, [
          {
            id: itemId,
            name: nameWithoutExt,
            ext,
            width,
            height,
            btime,
            mtime,
            dominantColor,
            paletteJson: JSON.stringify(eaglePalettes),
            tagsJson: tags.length > 0 ? JSON.stringify(tags) : null,
            foldersJson: folders.length > 0 ? JSON.stringify(folders) : null,
            annotation: annotation || undefined,
            contentHash,
            compactJson: JSON.stringify(compact),
            mediaRelPath,
            thumbRelPath,
          },
        ])

        clearMediaPathCache()
        invalidateCatalogCache()
      } catch (err) {
        console.warn('[Watcher] Error handling added file:', err)
      }
    })

    watcher.on('unlink', async (filePath) => {
      try {
        const normPath = path.resolve(filePath).toLowerCase()
        const knownId = this.sourcePathToItemId.get(normPath)
        this.sourcePathToItemId.delete(normPath)

        let row: any = null
        if (knownId) {
          row = this.db.prepare(
            'SELECT id, name, content_hash, tags_json, folders_json, dominant_color, palette_json FROM items WHERE library_id = ? AND id = ?'
          ).get(libraryId, knownId)
        }

        if (!row) {
          const baseName = path.basename(filePath, path.extname(filePath))
          const ext = path.extname(filePath).toLowerCase().replace(/^\./, '')
          row = this.db.prepare(
            'SELECT id, name, content_hash, tags_json, folders_json, dominant_color, palette_json FROM items WHERE library_id = ? AND name = ? AND ext = ? AND is_deleted = 0'
          ).get(libraryId, baseName, ext)
        }

        if (row && row.content_hash) {
          const detail = this.repo.getItemDetail(libraryId, row.id)
          const parsedPalette = row.palette_json ? JSON.parse(row.palette_json) : undefined
          const hexPalette = parsedPalette ? eaglePaletteToHexStrings(parsedPalette) : undefined

          // Schedule item deletion in 30 seconds if not reclaimed by an add event (rename/move)
          const deleteTimeout = setTimeout(() => {
            try {
              this.repo.markItemDeleted(libraryId, row.id)
              this.recentDeletions.delete(row.content_hash)
            } catch (err) {
              console.warn('[Watcher] Error marking item deleted on unlink timeout:', err)
            }
          }, 30000)

          this.recentDeletions.set(row.content_hash, {
            id: row.id,
            name: row.name,
            libraryId,
            contentHash: row.content_hash,
            tags: row.tags_json ? JSON.parse(row.tags_json) : undefined,
            folders: row.folders_json ? JSON.parse(row.folders_json) : undefined,
            annotation: detail?.annotation,
            dominantColor: row.dominant_color,
            palette: hexPalette,
            timestamp: Date.now(),
            deleteTimeout,
          })
        }
      } catch (err) {
        console.warn('[Watcher] Error handling deleted file:', err)
      }
    })

    this.watchers.set(libraryId, watcher)
  }

  stopWatching(libraryId: string): void {
    const watcher = this.watchers.get(libraryId)
    if (watcher) {
      watcher.close()
      this.watchers.delete(libraryId)
    }
  }

  stopAll(): void {
    for (const [_, del] of this.recentDeletions) {
      if (del.deleteTimeout) {
        clearTimeout(del.deleteTimeout)
      }
    }
    this.recentDeletions.clear()
    this.sourcePathToItemId.clear()
    for (const [_, w] of this.watchers) {
      w.close()
    }
    this.watchers.clear()
  }
}

let sharedWatcher: LibraryFileWatcher | null = null

export function getLibraryFileWatcher(db: Database.Database): LibraryFileWatcher {
  if (!sharedWatcher) {
    sharedWatcher = new LibraryFileWatcher(db)
  }
  return sharedWatcher
}

export function startConfiguredWatchers(db: Database.Database): LibraryFileWatcher {
  const watcher = getLibraryFileWatcher(db)
  const configs = getLibrariesConfig()
  for (const cfg of configs) {
    if (cfg.sourceFolderPath && fs.existsSync(cfg.sourceFolderPath)) {
      watcher.startWatching(cfg.id, cfg.sourceFolderPath, cfg.path)
    }
  }
  return watcher
}

export function stopAllLibraryWatchers(): void {
  if (sharedWatcher) {
    sharedWatcher.stopAll()
  }
}
