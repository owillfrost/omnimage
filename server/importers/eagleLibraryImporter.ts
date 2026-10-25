import type Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { CatalogRepository } from '../db/catalogRepository'
import { getLibrariesConfig } from '../config/librariesConfig'
import type {
  CatalogFolderNode,
  CatalogTagGroup,
  CatalogTaxonomyResponse,
  CompactCatalogItem,
} from '../../src/contracts/schemas'

export interface EagleRawItem {
  id: string
  name: string
  size?: number
  ext: string
  width?: number
  height?: number
  duration?: number
  btime?: number
  mtime?: number
  tags?: string[]
  folders?: string[]
  url?: string
  annotation?: string
  isDeleted?: boolean
  noThumbnail?: boolean
  palettes?: Array<{ color: [number, number, number]; ratio: number }>
}

export interface EagleRootMetadata {
  folders: Array<{
    id: string
    name: string
    description?: string
    iconColor?: string
    children?: any[]
    modificationTime?: number
  }>
  tagsGroups?: Array<{
    id: string
    name: string
    tags: string[]
    description?: string
  }>
}

function findExistingCacheDirs(): string[] {
  return [
    path.resolve(process.cwd(), '.omnimage/cache'),
    path.resolve(process.cwd(), '.cosmos/cache'),
    path.resolve(process.cwd(), 'node_modules/.cache/omnimage'),
  ]
}

export function findCacheFile(fileName: string): string | null {
  for (const dir of findExistingCacheDirs()) {
    const candidate = path.join(dir, fileName)
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

export class EagleLibraryImporter {
  private repo: CatalogRepository
  private omnimageDir: string

  constructor(db: Database.Database) {
    this.repo = new CatalogRepository(db)
    this.omnimageDir = path.resolve(process.cwd(), '.omnimage')
    if (!fs.existsSync(this.omnimageDir)) {
      fs.mkdirSync(this.omnimageDir, { recursive: true })
    }
  }

  /**
   * Fast Zero-Copy Import of an Eagle library into SQLite.
   * Prioritizes pre-indexed cache files (seeds 35,000+ items in < 1 second).
   * Falls back to scanning .library directly on disk without Eagle App running.
   */
  async importLibrary(
    libraryId: string,
    options: {
      libraryPath?: string
      force?: boolean
    } = {}
  ): Promise<{ importedCount: number; fromCache: boolean; timeMs: number }> {
    const startTime = performance.now()
    const existingCount = this.repo.countItems(libraryId)

    if (existingCount > 0 && !options.force) {
      return {
        importedCount: existingCount,
        fromCache: false,
        timeMs: Math.round(performance.now() - startTime),
      }
    }

    const configs = getLibrariesConfig()
    const config = configs.find(c => c.id === libraryId)
    const rootPath = options.libraryPath || config?.path || ''

    // 1. Try Fast-Seed from existing cache
    const cacheFileName = `index-${libraryId}.json`
    const cacheFilePath = findCacheFile(cacheFileName)

    let importedCount = 0
    let fromCache = false

    if (cacheFilePath) {
      const result = await this.seedFromCacheFile(libraryId, rootPath, cacheFilePath)
      importedCount = result.count
      fromCache = true
    } else if (rootPath && fs.existsSync(rootPath)) {
      importedCount = await this.scanLibraryOnDisk(libraryId, rootPath)
    } else {
      throw new Error(`Cannot import library "${libraryId}": no cache file and path "${rootPath}" not found.`)
    }

    // Copy or link binary embeddings if available
    this.ensureEmbeddingsLinked(libraryId)

    // Save/update root taxonomy sidecar (.omnimage/taxonomy-${libraryId}.json)
    this.exportTaxonomySidecar(libraryId, rootPath)

    const timeMs = Math.round(performance.now() - startTime)
    return { importedCount, fromCache, timeMs }
  }

  private async seedFromCacheFile(
    libraryId: string,
    rootPath: string,
    filePath: string
  ): Promise<{ count: number }> {
    const rawContent = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(rawContent)
    const rawItems: EagleRawItem[] = Array.isArray(parsed) ? parsed : (parsed.data || [])

    const batch = new Array(rawItems.length)
    let validCount = 0

    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i]
      if (!item || !item.id || !item.name || item.isDeleted) continue

      const hasAnnot = Boolean(item.annotation && item.annotation.trim().length > 0)

      // Payload leve para o Grid (zero overhead de prompts longos)
      const compact: CompactCatalogItem = {
        id: item.id,
        name: item.name,
        ext: item.ext,
        width: item.width,
        height: item.height,
        duration: typeof item.duration === 'number' && item.duration > 0 ? item.duration : undefined,
        btime: item.btime,
        tags: item.tags && item.tags.length > 0 ? item.tags : undefined,
        folders: item.folders && item.folders.length > 0 ? item.folders : undefined,
        url: item.url && item.url.trim().length > 0 ? item.url : undefined,
        hasAnnotation: hasAnnot ? true : undefined,
        palettes: item.palettes?.slice(0, 4).map(p => ({
          color: p.color,
          ratio: typeof p.ratio === 'number' ? Math.round(p.ratio) : 1,
        })),
      }

      const mediaRelPath = `images/${item.id}.info/${item.name}.${item.ext}`
      const thumbRelPath = `images/${item.id}.info/_thumbnail.png`

      batch[validCount++] = {
        id: item.id,
        name: item.name,
        ext: item.ext,
        width: item.width,
        height: item.height,
        duration: item.duration,
        btime: item.btime,
        mtime: item.mtime || item.btime,
        dominantColor: item.palettes?.[0]
          ? `#${((1 << 24) + (item.palettes[0].color[0] << 16) + (item.palettes[0].color[1] << 8) + item.palettes[0].color[2]).toString(16).slice(1)}`
          : '#18181b',
        paletteJson: item.palettes ? JSON.stringify(item.palettes) : null,
        tagsJson: item.tags ? JSON.stringify(item.tags) : null,
        foldersJson: item.folders ? JSON.stringify(item.folders) : null,
        url: item.url,
        annotation: item.annotation,
        compactJson: JSON.stringify(compact),
        mediaRelPath,
        thumbRelPath,
      }
    }

    batch.length = validCount

    // Register library in libraries table
    this.repo.upsertLibrary({
      id: libraryId,
      name: libraryId === 'google-flow' ? 'Google Flow + Prompts' : `${libraryId}.library`,
      rootPath,
      sourceType: 'eagle-library',
      itemCount: validCount,
    })

    // Atomic transaction batch insert
    this.repo.insertItemsBatch(libraryId, batch)

    return { count: validCount }
  }

  private async scanLibraryOnDisk(libraryId: string, rootPath: string): Promise<number> {
    const imagesDir = path.join(rootPath, 'images')
    if (!fs.existsSync(imagesDir)) return 0

    const infoDirs = fs.readdirSync(imagesDir).filter(d => d.endsWith('.info'))
    const batch = []

    for (const infoDir of infoDirs) {
      const metaPath = path.join(imagesDir, infoDir, 'metadata.json')
      if (!fs.existsSync(metaPath)) continue

      try {
        const item: EagleRawItem = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
        if (!item || !item.id || !item.name || item.isDeleted) continue

        const hasAnnot = Boolean(item.annotation && item.annotation.trim().length > 0)
        const compact: CompactCatalogItem = {
          id: item.id,
          name: item.name,
          ext: item.ext,
          width: item.width,
          height: item.height,
          duration: typeof item.duration === 'number' && item.duration > 0 ? item.duration : undefined,
          btime: item.btime,
          tags: item.tags && item.tags.length > 0 ? item.tags : undefined,
          folders: item.folders && item.folders.length > 0 ? item.folders : undefined,
          url: item.url && item.url.trim().length > 0 ? item.url : undefined,
          hasAnnotation: hasAnnot ? true : undefined,
          palettes: item.palettes?.slice(0, 4).map(p => ({
            color: p.color,
            ratio: typeof p.ratio === 'number' ? Math.round(p.ratio) : 1,
          })),
        }

        const mediaRelPath = `images/${item.id}.info/${item.name}.${item.ext}`
        const thumbRelPath = `images/${item.id}.info/_thumbnail.png`

        batch.push({
          id: item.id,
          name: item.name,
          ext: item.ext,
          width: item.width,
          height: item.height,
          duration: item.duration,
          btime: item.btime,
          mtime: item.mtime || item.btime,
          dominantColor: item.palettes?.[0]
            ? `#${((1 << 24) + (item.palettes[0].color[0] << 16) + (item.palettes[0].color[1] << 8) + item.palettes[0].color[2]).toString(16).slice(1)}`
            : '#18181b',
          paletteJson: item.palettes ? JSON.stringify(item.palettes) : null,
          tagsJson: item.tags ? JSON.stringify(item.tags) : null,
          foldersJson: item.folders ? JSON.stringify(item.folders) : null,
          url: item.url,
          annotation: item.annotation,
          compactJson: JSON.stringify(compact),
          mediaRelPath,
          thumbRelPath,
        })
      } catch {
        // Skip malformed info entry
      }
    }

    this.repo.upsertLibrary({
      id: libraryId,
      name: libraryId === 'google-flow' ? 'Google Flow + Prompts' : `${libraryId}.library`,
      rootPath,
      sourceType: 'eagle-library',
      itemCount: batch.length,
    })

    this.repo.insertItemsBatch(libraryId, batch)
    return batch.length
  }

  private ensureEmbeddingsLinked(libraryId: string): void {
    const binName = `embeddings-${libraryId}.bin`
    const cacheBin = findCacheFile(binName)
    if (!cacheBin) return

    const targetDir = path.join(this.omnimageDir, 'embeddings')
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    const targetFile = path.join(targetDir, binName)
    if (!fs.existsSync(targetFile)) {
      try {
        fs.copyFileSync(cacheBin, targetFile)
      } catch {
        // ignore
      }
    }
  }

  exportTaxonomySidecar(libraryId: string, rootPath: string): CatalogTaxonomyResponse | null {
    let metadata: EagleRootMetadata | null = null

    if (rootPath && fs.existsSync(path.join(rootPath, 'metadata.json'))) {
      try {
        metadata = JSON.parse(fs.readFileSync(path.join(rootPath, 'metadata.json'), 'utf-8'))
      } catch {
        // ignore
      }
    }

    // Build folder tree and counts
    const folderNameMap: Record<string, string> = {}
    const folderNodes: CatalogFolderNode[] = []

    function mapFolder(raw: any): CatalogFolderNode {
      folderNameMap[raw.id] = raw.name
      const children = (raw.children || []).map(mapFolder)
      const allIds = [raw.id]
      for (const c of children) {
        allIds.push(...c.allFolderIds)
      }
      return {
        id: raw.id,
        name: raw.name,
        description: raw.description,
        iconColor: raw.iconColor,
        itemCount: 0,
        directCount: 0,
        allFolderIds: allIds,
        children,
      }
    }

    if (metadata?.folders) {
      for (const f of metadata.folders) {
        folderNodes.push(mapFolder(f))
      }
    }

    const tagGroups: CatalogTagGroup[] = (metadata?.tagsGroups || []).map(g => ({
      id: g.id,
      name: g.name,
      tags: g.tags || [],
      description: g.description,
    }))

    const totalCount = this.repo.countItems(libraryId)

    const response: CatalogTaxonomyResponse = {
      status: 'success',
      library: libraryId,
      folders: folderNodes,
      tags: [],
      tagsGroups: tagGroups,
      folderNameMap,
      totalCount,
    }

    // Persist to .omnimage/taxonomy-${libraryId}.json
    const sidecarPath = path.join(this.omnimageDir, `taxonomy-${libraryId}.json`)
    try {
      fs.writeFileSync(sidecarPath, JSON.stringify(response, null, 2), 'utf-8')
    } catch {
      // ignore
    }

    return response
  }
}
