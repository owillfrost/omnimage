import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { CatalogRepository, invalidateCatalogCache } from '../db/catalogRepository'
import { SidecarManager, type ItemSidecarMetadata } from '../sidecar/sidecarManager'
import { computeFileContentHash, generateItemId } from '../media/contentHasher'
import { generateImageThumbnailAndPalette } from '../media/thumbnailGenerator'
import { generateVideoThumbnailAndPalette } from '../media/videoThumbnailer'
import { clearMediaPathCache } from '../media/mediaStreamServer'
import { extractComfyMetadataFromPngFile } from '../metadata/comfyPngParser'
import type { CatalogFolderNode, CompactCatalogItem } from '../../src/contracts/schemas'

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'svg', 'bmp'])
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'm4v'])
const IGNORED_DIRS = new Set(['.omnimage', '.cosmos', '.git', 'node_modules', '.cache', '$recycle.bin', 'dist', 'images'])

export interface ScanFolderProgress {
  scannedFiles: number
  processedItems: number
  currentFile?: string
}

export interface EagleItemMetadataJson {
  id: string
  name: string
  size: number
  btime: number
  mtime: number
  ext: string
  tags: string[]
  folders: string[]
  isDeleted: boolean
  url: string
  annotation: string
  modificationTime: number
  width?: number
  height?: number
  duration?: number
  palettes: Array<{ color: [number, number, number]; ratio: number }>
  contentHash?: string
}

/**
 * Links file via instant NTFS/POSIX hardlink (0 extra disk space on same volume),
 * falling back automatically to physical file copy across different drives.
 */
export function linkOrCopyFile(srcPath: string, destPath: string, mode: 'hardlink' | 'copy' = 'hardlink'): void {
  if (fs.existsSync(destPath)) {
    return
  }
  const destDir = path.dirname(destPath)
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }

  if (mode === 'hardlink') {
    try {
      fs.linkSync(srcPath, destPath)
      return
    } catch {
      // Fallback to physical copy if across different drives (EXDEV) or filesystem doesn't support hardlinks
    }
  }
  fs.copyFileSync(srcPath, destPath)
}

/**
 * Resolves the target .library container path for a given source folder.
 * If sourcePath already ends with .library, uses it directly.
 * Otherwise creates a sibling `{SanitizedName}.library` folder next to sourcePath.
 */
export function resolveTargetLibraryPath(libraryId: string, sourcePath: string, explicitTarget?: string): string {
  if (explicitTarget) return explicitTarget
  const cleanSource = sourcePath.replace(/[\\/]+$/, '')
  if (cleanSource.toLowerCase().endsWith('.library')) {
    return cleanSource
  }

  const parentDir = path.dirname(cleanSource)
  const baseName = libraryId.replace(/[^a-zA-Z0-9_-]/g, '') || path.basename(cleanSource) || 'Collection'
  const candidate = path.join(parentDir, `${baseName}.library`)

  try {
    if (!fs.existsSync(candidate)) {
      fs.mkdirSync(candidate, { recursive: true })
    }
    return candidate
  } catch {
    // Fallback to local .omnimage/libraries/{baseName}.library if parent directory is not writable
    const fallback = path.resolve(process.cwd(), '.omnimage', 'libraries', `${baseName}.library`)
    fs.mkdirSync(fallback, { recursive: true })
    return fallback
  }
}

export class FolderScanner {
  private db: Database.Database
  private repo: CatalogRepository

  constructor(db: Database.Database) {
    this.db = db
    this.repo = new CatalogRepository(db)
  }

  /**
   * Scans a regular folder of images/videos and builds/updates an Eagle-compatible `.library`
   * sandbox (`{Name}.library/images/{ID}.info/` with original file, `_thumbnail.webp` 640px, and `metadata.json`).
   */
  async scanFolder(
    libraryId: string,
    sourceFolderPath: string,
    options: {
      targetLibraryPath?: string
      importMode?: 'hardlink' | 'copy'
      onProgress?: (progress: ScanFolderProgress) => void
    } = {}
  ): Promise<{
    totalItems: number
    newItems: number
    libraryPath: string
    sourceFolderPath: string
  }> {
    if (!fs.existsSync(sourceFolderPath)) {
      throw new Error(`A pasta "${sourceFolderPath}" não existe no disco.`)
    }

    const libraryRootPath = resolveTargetLibraryPath(libraryId, sourceFolderPath, options.targetLibraryPath)
    const imagesDir = path.join(libraryRootPath, 'images')
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true })
    }

    const sidecarMgr = new SidecarManager(libraryRootPath)
    const folderMap = new Map<string, CatalogFolderNode>()
    const rootFolders: CatalogFolderNode[] = []
    const filesToProcess: { fullPath: string; relPath: string; ext: string; folderIds: string[] }[] = []

    // Load existing items by content_hash so incremental re-scans reuse IDs, tags, annotations & thumbnails
    const existingRows = this.db
      .prepare(
        `SELECT i.id, i.content_hash, i.name, i.ext, i.width, i.height, i.duration, i.btime, i.mtime,
                i.dominant_color, i.palette_json, i.tags_json, i.folders_json, i.url, i.compact_json,
                d.annotation
         FROM items i
         LEFT JOIN item_details d ON d.library_id = i.library_id AND d.id = i.id
         WHERE i.library_id = ? AND i.is_deleted = 0`
      )
      .all(libraryId) as any[]

    const existingByHash = new Map<string, any>()
    for (const r of existingRows) {
      if (r.content_hash) {
        existingByHash.set(r.content_hash, r)
      }
    }

    // 1. Recursive scan of source directory
    const scanDir = (currentDir: string, currentFolderIds: string[], parentNode?: CatalogFolderNode) => {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true })
      } catch {
        return
      }

      for (const entry of entries) {
        const name = entry.name
        if (
          IGNORED_DIRS.has(name.toLowerCase()) ||
          name.startsWith('.') ||
          name.toLowerCase().endsWith('.library') ||
          name.toLowerCase().endsWith('.info')
        ) {
          continue
        }

        const fullPath = path.join(currentDir, name)
        if (entry.isDirectory()) {
          const relDir = path.relative(sourceFolderPath, fullPath).replace(/\\/g, '/')
          const folderId = `f_${Buffer.from(relDir).toString('hex').slice(0, 16)}`
          let node = folderMap.get(folderId)
          if (!node) {
            node = {
              id: folderId,
              name,
              itemCount: 0,
              directCount: 0,
              allFolderIds: [folderId],
              children: [],
            }
            folderMap.set(folderId, node)
            if (parentNode) {
              parentNode.children.push(node)
              parentNode.allFolderIds.push(folderId)
            } else {
              rootFolders.push(node)
            }
          }
          scanDir(fullPath, [...currentFolderIds, folderId], node)
        } else if (entry.isFile()) {
          const ext = path.extname(name).toLowerCase().replace(/^\./, '')
          if (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext)) {
            const relPath = path.relative(sourceFolderPath, fullPath).replace(/\\/g, '/')
            filesToProcess.push({
              fullPath,
              relPath,
              ext,
              folderIds: currentFolderIds,
            })
          }
        }
      }
    }

    scanDir(sourceFolderPath, [])

    const batch = []
    let newItemsCount = 0
    const folderDirectCounts = new Map<string, number>()
    const folderTotalCounts = new Map<string, number>()

    // 2. Process files into Eagle-style `{libraryRootPath}/images/{itemId}.info/`
    for (let i = 0; i < filesToProcess.length; i++) {
      const itemInfo = filesToProcess[i]
      if (options.onProgress) {
        options.onProgress({
          scannedFiles: filesToProcess.length,
          processedItems: i + 1,
          currentFile: itemInfo.relPath,
        })
      }

      let stat: fs.Stats
      try {
        stat = fs.statSync(itemInfo.fullPath)
      } catch {
        continue
      }

      const contentHash = await computeFileContentHash(itemInfo.fullPath, stat.size)
      const existing = existingByHash.get(contentHash)
      const itemId = existing?.id || generateItemId()
      const nameWithoutExt = existing?.name || path.basename(itemInfo.fullPath, path.extname(itemInfo.fullPath))
      const safeFileName = `${nameWithoutExt}.${itemInfo.ext}`

      // Eagle-style .info folder inside {libraryRootPath}/images/{itemId}.info
      const infoDir = path.join(imagesDir, `${itemId}.info`)
      if (!fs.existsSync(infoDir)) {
        fs.mkdirSync(infoDir, { recursive: true })
      }

      const targetMediaPath = path.join(infoDir, safeFileName)
      const targetThumbPath = path.join(infoDir, '_thumbnail.webp')
      const targetMetaPath = path.join(infoDir, 'metadata.json')

      // 2.1 Link or copy media file into .info folder
      try {
        linkOrCopyFile(itemInfo.fullPath, targetMediaPath, options.importMode || 'hardlink')
      } catch {
        // Fallback if file is locked
      }

      const mediaRelPath = `images/${itemId}.info/${safeFileName}`
      const thumbRelPath = `images/${itemId}.info/_thumbnail.webp`

      let width = existing?.width || 640
      let height = existing?.height || 640
      let dominantColor = existing?.dominant_color || '#18181b'
      let palette: string[] = ['#18181b']
      let paletteWeights: number[] = [1]

      if (existing && fs.existsSync(targetThumbPath)) {
        try {
          if (existing.palette_json) {
            const parsedPalette = JSON.parse(existing.palette_json)
            if (Array.isArray(parsedPalette) && parsedPalette.length > 0) {
              if (typeof parsedPalette[0] === 'string') {
                palette = parsedPalette
              } else if (parsedPalette[0]?.color) {
                palette = parsedPalette.map((p: any) => {
                  const [r, g, b] = p.color
                  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`
                })
                paletteWeights = parsedPalette.map((p: any) => (p.ratio || 1) / 100)
              }
            }
          }
        } catch {
          // ignore
        }
      } else {
        const isVideo = VIDEO_EXTS.has(itemInfo.ext)
        try {
          const thumbResult = isVideo
            ? await generateVideoThumbnailAndPalette(itemInfo.fullPath, targetThumbPath)
            : await generateImageThumbnailAndPalette(itemInfo.fullPath, targetThumbPath)
          width = thumbResult.width
          height = thumbResult.height
          dominantColor = thumbResult.dominantColor
          palette = thumbResult.palette
          paletteWeights = thumbResult.paletteWeights
        } catch {
          // keep defaults
        }
        newItemsCount++
      }

      const btime = existing?.btime || Math.floor(stat.birthtimeMs || stat.mtimeMs)
      const mtime = Math.floor(stat.mtimeMs)
      const tags: string[] = existing?.tags_json ? JSON.parse(existing.tags_json) : []
      const folders: string[] = itemInfo.folderIds.length > 0
        ? itemInfo.folderIds
        : (existing?.folders_json ? JSON.parse(existing.folders_json) : [])
      const url: string = existing?.url || ''
      let annotation: string = existing?.annotation || ''
      if (!annotation && itemInfo.ext === 'png') {
        const comfy = extractComfyMetadataFromPngFile(itemInfo.fullPath)
        if (comfy?.positivePrompt) {
          annotation = comfy.positivePrompt
        }
      }

      // Track folder counts
      if (folders.length > 0) {
        const directFolder = folders[folders.length - 1]
        folderDirectCounts.set(directFolder, (folderDirectCounts.get(directFolder) || 0) + 1)
        for (const fid of folders) {
          folderTotalCounts.set(fid, (folderTotalCounts.get(fid) || 0) + 1)
        }
      }

      const eaglePalettes = palette.slice(0, 5).map((hex, idx) => {
        const clean = hex.replace('#', '')
        const r = parseInt(clean.slice(0, 2), 16) || 0
        const g = parseInt(clean.slice(2, 4), 16) || 0
        const b = parseInt(clean.slice(4, 6), 16) || 0
        const ratio = paletteWeights[idx] !== undefined
          ? Math.max(1, Math.round(paletteWeights[idx] * 100))
          : Math.round(100 / palette.length)
        return { color: [r, g, b] as [number, number, number], ratio }
      })

      // 2.2 Write Eagle-compatible images/{itemId}.info/metadata.json
      const eagleMeta: EagleItemMetadataJson = {
        id: itemId,
        name: nameWithoutExt,
        size: stat.size,
        btime,
        mtime,
        ext: itemInfo.ext,
        tags,
        folders,
        isDeleted: false,
        url,
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

      // Also keep .cosmos sidecar for SidecarManager compatibility
      const sidecarMeta: ItemSidecarMetadata = {
        id: itemId,
        name: nameWithoutExt,
        ext: itemInfo.ext,
        width,
        height,
        btime,
        mtime,
        dominantColor,
        palette,
        paletteWeights,
        tags: tags.length > 0 ? tags : undefined,
        folders: folders.length > 0 ? folders : undefined,
        url: url || undefined,
        annotation: annotation || undefined,
        contentHash,
        relativePath: mediaRelPath,
        mediaRelPath,
        thumbRelPath,
      }
      sidecarMgr.saveItemSidecar(sidecarMeta)

      const hasAnnot = Boolean(annotation && annotation.trim().length > 0)
      const compact: CompactCatalogItem = {
        id: itemId,
        name: nameWithoutExt,
        ext: itemInfo.ext,
        width,
        height,
        btime,
        tags: tags.length > 0 ? tags : undefined,
        folders: folders.length > 0 ? folders : undefined,
        url: url || undefined,
        hasAnnotation: hasAnnot ? true : undefined,
        palettes: eaglePalettes.slice(0, 4),
      }

      batch.push({
        id: itemId,
        name: nameWithoutExt,
        ext: itemInfo.ext,
        width,
        height,
        duration: undefined,
        btime,
        mtime,
        dominantColor,
        paletteJson: JSON.stringify(eaglePalettes),
        tagsJson: tags.length > 0 ? JSON.stringify(tags) : null,
        foldersJson: folders.length > 0 ? JSON.stringify(folders) : null,
        url: url || null,
        annotation: annotation || undefined,
        contentHash,
        compactJson: JSON.stringify(compact),
        mediaRelPath,
        thumbRelPath,
      })
    }

    // Populate folder counts recursively
    const folderNameMap: Record<string, string> = {}
    const updateCounts = (nodes: CatalogFolderNode[]) => {
      for (const node of nodes) {
        folderNameMap[node.id] = node.name
        node.directCount = folderDirectCounts.get(node.id) || 0
        node.itemCount = folderTotalCounts.get(node.id) || node.directCount
        if (node.children.length > 0) {
          updateCounts(node.children)
        }
      }
    }
    updateCounts(rootFolders)

    // 3. Write Eagle-compatible root `{libraryRootPath}/metadata.json`
    const rootMetadataPath = path.join(libraryRootPath, 'metadata.json')
    const rootMetadata = {
      folders: rootFolders,
      tagsGroups: [],
      applicationVersion: '4.0.0',
      libraryId,
      sourceFolderPath,
    }
    fs.writeFileSync(rootMetadataPath, JSON.stringify(rootMetadata, null, 2), 'utf-8')

    // Also save taxonomy sidecar in global .omnimage/taxonomy-{libraryId}.json and library .omnimage/library.json
    sidecarMgr.saveLibrarySidecar({
      library: libraryId,
      folders: rootFolders,
      tagsGroups: [],
    })

    const globalOmnimageDir = path.resolve(process.cwd(), '.omnimage')
    if (!fs.existsSync(globalOmnimageDir)) {
      fs.mkdirSync(globalOmnimageDir, { recursive: true })
    }
    fs.writeFileSync(
      path.join(globalOmnimageDir, `taxonomy-${libraryId}.json`),
      JSON.stringify(
        {
          status: 'success',
          library: libraryId,
          folders: rootFolders,
          tags: [],
          tagsGroups: [],
          folderNameMap,
          totalCount: batch.length,
        },
        null,
        2
      ),
      'utf-8'
    )

    // 4. Upsert Library and Batch Insert Items into SQLite
    const displayName = path.basename(libraryRootPath)
    this.repo.upsertLibrary({
      id: libraryId,
      name: displayName,
      rootPath: libraryRootPath,
      sourceFolderPath,
      sourceType: 'eagle-library',
      itemCount: batch.length,
    })

    if (batch.length > 0) {
      this.repo.insertItemsBatch(libraryId, batch)
    }

    clearMediaPathCache()
    invalidateCatalogCache()

    return {
      totalItems: batch.length,
      newItems: newItemsCount,
      libraryPath: libraryRootPath,
      sourceFolderPath,
    }
  }
}
