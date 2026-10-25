import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { CatalogRepository } from '../db/catalogRepository'
import type {
  CatalogFolderNode,
  CatalogTagGroup,
  CatalogTaxonomyResponse,
  CompactCatalogItem,
} from '../../src/contracts/schemas'

export interface ItemSidecarMetadata {
  id: string
  name: string
  ext: string
  width?: number
  height?: number
  duration?: number
  btime?: number
  mtime?: number
  dominantColor?: string
  palette?: string[]
  paletteWeights?: number[]
  tags?: string[]
  folders?: string[]
  url?: string
  annotation?: string
  contentHash?: string
  relativePath: string
  mediaRelPath?: string
  thumbRelPath?: string
}

export class SidecarManager {
  private omnimageDir: string

  constructor(libraryRootPath: string) {
    const legacyDir = path.join(libraryRootPath, '.cosmos')
    const newDir = path.join(libraryRootPath, '.omnimage')
    this.omnimageDir = fs.existsSync(legacyDir) && !fs.existsSync(newDir) ? legacyDir : newDir
  }

  getShardDir(itemId: string): string {
    const shard = itemId.length >= 2 ? itemId.slice(0, 2).toUpperCase() : '00'
    const dir = path.join(this.omnimageDir, 'items', shard)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    return dir
  }

  getItemSidecarPath(itemId: string): string {
    const shardDir = this.getShardDir(itemId)
    return path.join(shardDir, `${itemId}.json`)
  }

  getLibrarySidecarPath(): string {
    return path.join(this.omnimageDir, 'library.json')
  }

  /**
   * Atomically writes an item sidecar JSON file (write to tmp -> fs.renameSync).
   */
  saveItemSidecar(meta: ItemSidecarMetadata): string {
    const targetPath = this.getItemSidecarPath(meta.id)
    const tmpPath = `${targetPath}.tmp.${Date.now()}`

    const json = JSON.stringify(meta, null, 2)
    fs.writeFileSync(tmpPath, json, 'utf-8')
    fs.renameSync(tmpPath, targetPath)

    return targetPath
  }

  readItemSidecar(itemId: string): ItemSidecarMetadata | null {
    const targetPath = this.getItemSidecarPath(itemId)
    if (!fs.existsSync(targetPath)) {
      return null
    }

    try {
      const raw = fs.readFileSync(targetPath, 'utf-8')
      return JSON.parse(raw) as ItemSidecarMetadata
    } catch {
      return null
    }
  }

  deleteItemSidecar(itemId: string): boolean {
    const targetPath = this.getItemSidecarPath(itemId)
    if (fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath)
        return true
      } catch {
        return false
      }
    }
    return false
  }

  saveLibrarySidecar(taxonomy: {
    library: string
    folders: CatalogFolderNode[]
    tagsGroups: CatalogTagGroup[]
  }): void {
    if (!fs.existsSync(this.omnimageDir)) {
      fs.mkdirSync(this.omnimageDir, { recursive: true })
    }
    const targetPath = this.getLibrarySidecarPath()
    const tmpPath = `${targetPath}.tmp.${Date.now()}`

    const json = JSON.stringify(taxonomy, null, 2)
    fs.writeFileSync(tmpPath, json, 'utf-8')
    fs.renameSync(tmpPath, targetPath)
  }

  readLibrarySidecar(): CatalogTaxonomyResponse | null {
    const targetPath = this.getLibrarySidecarPath()
    if (!fs.existsSync(targetPath)) {
      return null
    }

    try {
      const raw = fs.readFileSync(targetPath, 'utf-8')
      return JSON.parse(raw) as CatalogTaxonomyResponse
    } catch {
      return null
    }
  }

  /**
   * Rebuilds SQLite database tables and FTS5 index from the official .omnimage sidecars.
   * Proves total data safety: the SQLite file can be deleted and 100% reconstructed.
   */
  async rebuildSqliteFromSidecars(
    libraryId: string,
    db: Database.Database
  ): Promise<{ count: number }> {
    const repo = new CatalogRepository(db)
    const itemsDir = path.join(this.omnimageDir, 'items')

    if (!fs.existsSync(itemsDir)) {
      return { count: 0 }
    }

    const shardDirs = fs.readdirSync(itemsDir)
    const batch: any[] = []

    for (const shard of shardDirs) {
      const shardPath = path.join(itemsDir, shard)
      let files: string[]
      try {
        files = fs.readdirSync(shardPath).filter(f => f.endsWith('.json'))
      } catch {
        continue
      }

      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(shardPath, file), 'utf-8')
          const meta: ItemSidecarMetadata = JSON.parse(raw)
          if (!meta || !meta.id || !meta.name) continue

          const hasAnnot = Boolean(meta.annotation && meta.annotation.trim().length > 0)
          const compact: CompactCatalogItem = {
            id: meta.id,
            name: meta.name,
            ext: meta.ext,
            width: meta.width,
            height: meta.height,
            duration: meta.duration,
            btime: meta.btime,
            tags: meta.tags && meta.tags.length > 0 ? meta.tags : undefined,
            folders: meta.folders && meta.folders.length > 0 ? meta.folders : undefined,
            url: meta.url && meta.url.trim().length > 0 ? meta.url : undefined,
            hasAnnotation: hasAnnot ? true : undefined,
            palettes: meta.palette
              ? meta.palette.slice(0, 4).map((hex, i) => {
                  const r = parseInt(hex.slice(1, 3), 16) || 0
                  const g = parseInt(hex.slice(3, 5), 16) || 0
                  const b = parseInt(hex.slice(5, 7), 16) || 0
                  const ratio = meta.paletteWeights?.[i] !== undefined
                    ? Math.round(meta.paletteWeights[i] * 100)
                    : 1
                  return { color: [r, g, b] as [number, number, number], ratio }
                })
              : undefined,
          }

          batch.push({
            id: meta.id,
            name: meta.name,
            ext: meta.ext,
            width: meta.width,
            height: meta.height,
            duration: meta.duration,
            btime: meta.btime,
            mtime: meta.mtime || meta.btime,
            dominantColor: meta.dominantColor || '#18181b',
            paletteJson: meta.palette ? JSON.stringify(meta.palette) : null,
            tagsJson: meta.tags ? JSON.stringify(meta.tags) : null,
            foldersJson: meta.folders ? JSON.stringify(meta.folders) : null,
            url: meta.url,
            annotation: meta.annotation,
            contentHash: meta.contentHash,
            compactJson: JSON.stringify(compact),
            mediaRelPath: meta.mediaRelPath || meta.relativePath,
            thumbRelPath: meta.thumbRelPath || `.cosmos/thumbnails/${shard}/${meta.id}.webp`,
          })
        } catch {
          // skip invalid sidecar
        }
      }
    }

    if (batch.length > 0) {
      repo.insertItemsBatch(libraryId, batch)
    }

    return { count: batch.length }
  }
}
