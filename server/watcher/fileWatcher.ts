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
import type { CompactCatalogItem } from '../../src/contracts/schemas'

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'svg', 'bmp'])
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'm4v'])

interface RecentDeletion {
  id: string
  name: string
  contentHash: string
  tags?: string[]
  folders?: string[]
  annotation?: string
  dominantColor?: string
  palette?: string[]
  paletteWeights?: number[]
  timestamp: number
}

export class LibraryFileWatcher {
  private watchers = new Map<string, FSWatcher>()
  private recentDeletions = new Map<string, RecentDeletion>()
  private db: Database.Database
  private repo: CatalogRepository

  constructor(db: Database.Database) {
    this.db = db
    this.repo = new CatalogRepository(db)

    // Cleanup stale deletions periodically
    setInterval(() => {
      const now = Date.now()
      for (const [key, del] of this.recentDeletions.entries()) {
        if (now - del.timestamp > 30000) {
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
        let palette: string[] = ['#18181b']
        let paletteWeights: number[] = [1]
        let width = 640
        let height = 640

        if (recent) {
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

        const nameWithoutExt = path.basename(filePath, path.extname(filePath))
        const safeFileName = `${nameWithoutExt}.${ext}`

        // Build Eagle-style {libraryRootPath}/images/{itemId}.info/
        const infoDir = path.join(libraryRootPath, 'images', `${itemId}.info`)
        if (!fs.existsSync(infoDir)) {
          fs.mkdirSync(infoDir, { recursive: true })
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

        const eaglePalettes = palette.slice(0, 5).map((hex, i) => {
          const clean = hex.replace('#', '')
          const r = parseInt(clean.slice(0, 2), 16) || 0
          const g = parseInt(clean.slice(2, 4), 16) || 0
          const b = parseInt(clean.slice(4, 6), 16) || 0
          return {
            color: [r, g, b] as [number, number, number],
            ratio: Math.max(1, Math.round((paletteWeights[i] || 1) * 100)),
          }
        })

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
          palette,
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
        const relPath = path.relative(watchFolderPath, filePath).replace(/\\/g, '/')
        const row = this.db.prepare(
          'SELECT id, name, content_hash, tags_json, folders_json, dominant_color, palette_json FROM items WHERE library_id = ? AND (media_rel_path = ? OR name = ?)'
        ).get(libraryId, relPath, path.basename(filePath, path.extname(filePath))) as any

        if (row && row.content_hash) {
          const detail = this.repo.getItemDetail(libraryId, row.id)
          this.recentDeletions.set(row.content_hash, {
            id: row.id,
            name: row.name,
            contentHash: row.content_hash,
            tags: row.tags_json ? JSON.parse(row.tags_json) : undefined,
            folders: row.folders_json ? JSON.parse(row.folders_json) : undefined,
            annotation: detail?.annotation,
            dominantColor: row.dominant_color,
            palette: row.palette_json ? JSON.parse(row.palette_json) : undefined,
            timestamp: Date.now(),
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
    for (const [_, w] of this.watchers) {
      w.close()
    }
    this.watchers.clear()
  }
}
