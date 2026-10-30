import type Database from 'better-sqlite3'
import zlib from 'node:zlib'
import type {
  LibrarySource,
  CompactCatalogItem,
  CatalogItemDetail,
  ItemMetadataPatch,
} from '../../src/contracts/schemas'
import type { SplitToningProfile } from '../../src/core/paletteExtractor'

export interface SerializedJsonPayload {
  raw: Buffer
  gzip: Buffer
  count: number
}

// In-memory cache for ultra-fast full library listings
const payloadCache = new Map<string, { payload: SerializedJsonPayload; version: number }>()
let currentVersion = 1

export function invalidateCatalogCache(): void {
  currentVersion++
  payloadCache.clear()
}

export class CatalogRepository {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  upsertLibrary(lib: {
    id: string
    name: string
    rootPath: string
    sourceFolderPath?: string | null
    sourceType: string
    itemCount?: number
    indexedEmbeddingCount?: number
    hidden?: boolean
  }): void {
    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT INTO libraries (id, name, root_path, source_folder_path, source_type, item_count, indexed_embedding_count, is_hidden, created_at, updated_at)
      VALUES (@id, @name, @rootPath, @sourceFolderPath, @sourceType, @itemCount, @indexedEmbeddingCount, @isHidden, @now, @now)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        root_path = excluded.root_path,
        source_folder_path = COALESCE(excluded.source_folder_path, libraries.source_folder_path),
        source_type = excluded.source_type,
        item_count = excluded.item_count,
        indexed_embedding_count = excluded.indexed_embedding_count,
        is_hidden = COALESCE(@isHiddenOverride, libraries.is_hidden),
        updated_at = excluded.updated_at
    `)

    stmt.run({
      id: lib.id,
      name: lib.name,
      rootPath: lib.rootPath,
      sourceFolderPath: lib.sourceFolderPath ?? null,
      sourceType: lib.sourceType,
      itemCount: lib.itemCount || 0,
      indexedEmbeddingCount: lib.indexedEmbeddingCount || 0,
      isHidden: lib.hidden ? 1 : 0,
      isHiddenOverride: typeof lib.hidden === 'boolean' ? (lib.hidden ? 1 : 0) : null,
      now,
    })
  }

  listLibraries(): LibrarySource[] {
    const rows = this.db.prepare(`
      SELECT
        id,
        name,
        root_path as path,
        source_folder_path as sourceFolderPath,
        source_type as type,
        item_count as itemCount,
        indexed_embedding_count as indexedEmbeddingCount,
        is_hidden as isHidden
      FROM libraries
      ORDER BY created_at ASC, name ASC
    `).all() as any[]

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      path: r.path,
      sourceFolderPath: r.sourceFolderPath || undefined,
      type: r.type,
      itemCount: r.itemCount || 0,
      indexedEmbeddingCount: r.indexedEmbeddingCount || 0,
      hidden: Boolean(r.isHidden),
    }))
  }

  getLibrary(id: string): LibrarySource | null {
    const row = this.db.prepare(`
      SELECT
        id,
        name,
        root_path as path,
        source_folder_path as sourceFolderPath,
        source_type as type,
        item_count as itemCount,
        indexed_embedding_count as indexedEmbeddingCount,
        is_hidden as isHidden
      FROM libraries
      WHERE id = ?
    `).get(id) as any
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      sourceFolderPath: row.sourceFolderPath || undefined,
      type: row.type,
      itemCount: row.itemCount || 0,
      indexedEmbeddingCount: row.indexedEmbeddingCount || 0,
      hidden: Boolean(row.isHidden),
    }
  }

  setLibraryHidden(libraryId: string, hidden: boolean): boolean {
    const info = this.db
      .prepare('UPDATE libraries SET is_hidden = ?, updated_at = ? WHERE id = ?')
      .run(hidden ? 1 : 0, Date.now(), libraryId)
    return info.changes > 0
  }

  deleteLibraryCascade(libraryId: string): boolean {
    const tx = this.db.transaction((libId: string) => {
      this.db.prepare('DELETE FROM items_fts WHERE library_id = ?').run(libId)
      this.db.prepare('DELETE FROM item_details WHERE library_id = ?').run(libId)
      this.db.prepare('DELETE FROM items WHERE library_id = ?').run(libId)
      const info = this.db.prepare('DELETE FROM libraries WHERE id = ?').run(libId)
      return info.changes > 0
    })
    const deleted = tx(libraryId)
    invalidateCatalogCache()
    return deleted
  }

  markItemDeleted(libraryId: string, id: string): boolean {
    const deleteFts = this.db.prepare('DELETE FROM items_fts WHERE library_id = ? AND id = ?')
    const deleteDetail = this.db.prepare('DELETE FROM item_details WHERE library_id = ? AND id = ?')
    const updateItem = this.db.prepare('UPDATE items SET is_deleted = 1 WHERE library_id = ? AND id = ?')

    const tx = this.db.transaction(() => {
      deleteFts.run(libraryId, id)
      deleteDetail.run(libraryId, id)
      const info = updateItem.run(libraryId, id)
      return info.changes > 0
    })

    const deleted = tx()
    if (deleted) {
      invalidateCatalogCache()
      const total = this.countItems(libraryId)
      this.db.prepare('UPDATE libraries SET item_count = ?, updated_at = ? WHERE id = ?').run(total, Date.now(), libraryId)
    }
    return deleted
  }

  countItems(libraryId: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count FROM items WHERE library_id = ? AND is_deleted = 0
    `).get(libraryId) as { count: number } | undefined
    return row?.count || 0
  }

  /**
   * Returns pre-serialized, pre-gzipped JSON buffer for full library listing.
   * Completely avoids JSON.stringify and JSON.parse overhead on every request.
   */
  getCompactJsonPayload(libraryId: string, limit = 50000): SerializedJsonPayload {
    const cacheKey = `${libraryId}:${limit}`
    const cached = payloadCache.get(cacheKey)
    if (cached && cached.version === currentVersion) {
      return cached.payload
    }

    const rows = this.db.prepare(`
      SELECT compact_json FROM items
      WHERE library_id = ? AND is_deleted = 0
      ORDER BY rowid DESC
      LIMIT ?
    `).all(libraryId, limit) as { compact_json: string }[]

    const count = rows.length
    let jsonString: string
    if (count === 0) {
      jsonString = '{"status":"success","total":0,"data":[]}'
    } else {
      const chunks: string[] = new Array(count)
      for (let i = 0; i < count; i++) {
        chunks[i] = rows[i].compact_json
      }
      jsonString = `{"status":"success","total":${count},"data":[${chunks.join(',')}]}`
    }

    const raw = Buffer.from(jsonString, 'utf-8')
    const gzip = zlib.gzipSync(raw, { level: zlib.constants.Z_BEST_SPEED })
    const payload: SerializedJsonPayload = { raw, gzip, count }

    payloadCache.set(cacheKey, { payload, version: currentVersion })
    return payload
  }

  /**
   * Parses and returns items array if typed objects are needed.
   */
  listCompactItems(libraryId: string, limit = 50000): CompactCatalogItem[] {
    const rows = this.db.prepare(`
      SELECT compact_json FROM items
      WHERE library_id = ? AND is_deleted = 0
      ORDER BY rowid DESC
      LIMIT ?
    `).all(libraryId, limit) as { compact_json: string }[]

    const items: CompactCatalogItem[] = new Array(rows.length)
    for (let i = 0; i < rows.length; i++) {
      items[i] = JSON.parse(rows[i].compact_json)
    }
    return items
  }

  /**
   * Performs an instant SQLite FTS5 search across names, tags, and annotations.
   */
  searchItemsFts(libraryId: string, queryText: string, limit = 50000): { raw: Buffer; count: number } {
    const cleanQuery = queryText
      .replace(/['"()*^:+\-]/g, ' ')
      .trim()

    if (!cleanQuery) {
      const payload = this.getCompactJsonPayload(libraryId, limit)
      return { raw: payload.raw, count: payload.count }
    }

    // Split words and add prefix wildcards
    const terms = cleanQuery.split(/\s+/).filter(Boolean)
    const ftsQuery = terms.map(t => `"${t}"*`).join(' AND ')

    const rows = this.db.prepare(`
      SELECT i.compact_json
      FROM items_fts f
      JOIN items i ON i.library_id = f.library_id AND i.id = f.id
      WHERE f.library_id = ? AND items_fts MATCH ? AND i.is_deleted = 0
      LIMIT ?
    `).all(libraryId, ftsQuery, limit) as { compact_json: string }[]

    const count = rows.length
    let jsonString: string
    if (count === 0) {
      jsonString = `{"status":"success","total":0,"query":${JSON.stringify(queryText)},"data":[]}`
    } else {
      const chunks: string[] = new Array(count)
      for (let i = 0; i < count; i++) {
        chunks[i] = rows[i].compact_json
      }
      jsonString = `{"status":"success","total":${count},"query":${JSON.stringify(queryText)},"data":[${chunks.join(',')}]}`
    }

    return {
      raw: Buffer.from(jsonString, 'utf-8'),
      count,
    }
  }

  /**
   * Fetches full item details including long annotation and raw file path on demand.
   */
  getItemDetail(libraryId: string, id: string): CatalogItemDetail | null {
    const itemRow = this.db.prepare(`
      SELECT i.*, d.annotation, d.raw_meta_json
      FROM items i
      LEFT JOIN item_details d ON d.library_id = i.library_id AND d.id = i.id
      WHERE i.library_id = ? AND i.id = ? AND i.is_deleted = 0
    `).get(libraryId, id) as any

    if (!itemRow) return null

    const compact: CompactCatalogItem = JSON.parse(itemRow.compact_json)

    return {
      ...compact,
      annotation: itemRow.annotation || undefined,
      contentHash: itemRow.content_hash || undefined,
      filePath: itemRow.media_rel_path,
    }
  }

  /**
   * Batch inserts items in a single atomic SQLite transaction (typically inserts 40,000 items in ~300ms).
   */
  insertItemsBatch(
    libraryId: string,
    items: Array<{
      id: string
      name: string
      ext: string
      width?: number
      height?: number
      duration?: number
      btime?: number
      mtime?: number
      dominantColor?: string | null
      paletteJson?: string | null
      splitToningJson?: string | null
      tagsJson?: string | null
      foldersJson?: string | null
      url?: string | null
      annotation?: string | null
      contentHash?: string | null
      compactJson: string
      mediaRelPath: string
      thumbRelPath?: string | null
    }>
  ): void {
    if (items.length === 0) return

    const insertItem = this.db.prepare(`
      INSERT OR REPLACE INTO items (
        library_id, id, content_hash, name, ext, width, height, duration,
        btime, mtime, dominant_color, palette_json, split_toning_json, tags_json, folders_json,
        url, has_annotation, compact_json, media_rel_path, thumb_rel_path, is_deleted
      ) VALUES (
        @library_id, @id, @content_hash, @name, @ext, @width, @height, @duration,
        @btime, @mtime, @dominant_color, @palette_json, @split_toning_json, @tags_json, @folders_json,
        @url, @has_annotation, @compact_json, @media_rel_path, @thumb_rel_path, 0
      )
    `)

    const insertDetail = this.db.prepare(`
      INSERT OR REPLACE INTO item_details (library_id, id, annotation, raw_meta_json)
      VALUES (@library_id, @id, @annotation, NULL)
    `)

    const deleteFts = this.db.prepare(`
      DELETE FROM items_fts WHERE library_id = ? AND id = ?
    `)

    const insertFts = this.db.prepare(`
      INSERT INTO items_fts (library_id, id, name, tags_text, annotation)
      VALUES (@library_id, @id, @name, @tags_text, @annotation)
    `)

    // Only query and delete if the library already contains items to avoid 50,000 FTS5 table scans on initial seed
    const hasExisting = this.countItems(libraryId) > 0
    let existingIds: Set<string> | null = null
    if (hasExisting) {
      const rows = this.db.prepare('SELECT id FROM items WHERE library_id = ?').all(libraryId) as { id: string }[]
      existingIds = new Set(rows.map(r => r.id))
    }

    const tx = this.db.transaction((batch) => {
      for (const item of batch) {
        const hasAnnotation = item.annotation && item.annotation.trim().length > 0 ? 1 : 0
        insertItem.run({
          library_id: libraryId,
          id: item.id,
          content_hash: item.contentHash || null,
          name: item.name,
          ext: item.ext,
          width: item.width || null,
          height: item.height || null,
          duration: item.duration || null,
          btime: item.btime || null,
          mtime: item.mtime || null,
          dominant_color: item.dominantColor || null,
          palette_json: item.paletteJson || null,
          split_toning_json: item.splitToningJson || null,
          tags_json: item.tagsJson || null,
          folders_json: item.foldersJson || null,
          url: item.url || null,
          has_annotation: hasAnnotation,
          compact_json: item.compactJson,
          media_rel_path: item.mediaRelPath,
          thumb_rel_path: item.thumbRelPath || null,
        })

        if (hasAnnotation) {
          insertDetail.run({
            library_id: libraryId,
            id: item.id,
            annotation: item.annotation,
          })
        }

        const tagsArray: string[] = item.tagsJson ? JSON.parse(item.tagsJson) : []
        const tagsText = tagsArray.join(' ')
        if (existingIds && existingIds.has(item.id)) {
          deleteFts.run(libraryId, item.id)
        }
        insertFts.run({
          library_id: libraryId,
          id: item.id,
          name: item.name,
          tags_text: tagsText,
          annotation: item.annotation || '',
        })
      }
    })

    tx(items)
    invalidateCatalogCache()

    // Update library item count
    const total = this.countItems(libraryId)
    this.db.prepare('UPDATE libraries SET item_count = ?, updated_at = ? WHERE id = ?').run(total, Date.now(), libraryId)
  }

  updateItemMetadata(libraryId: string, id: string, patch: ItemMetadataPatch): boolean {
    const existing = this.getItemDetail(libraryId, id)
    if (!existing) return false

    const newName = patch.name !== undefined ? patch.name : existing.name
    const newTags = patch.tags !== undefined ? patch.tags : existing.tags
    const newFolders = patch.folders !== undefined ? patch.folders : existing.folders
    const newAnnotation = patch.annotation !== undefined ? patch.annotation : existing.annotation
    const newUrl = patch.url !== undefined ? patch.url : existing.url

    const hasAnnotation = newAnnotation && newAnnotation.trim().length > 0 ? 1 : 0

    const compactObj: CompactCatalogItem = {
      id: existing.id,
      name: newName,
      ext: existing.ext,
      width: existing.width,
      height: existing.height,
      duration: existing.duration,
      btime: existing.btime,
      tags: newTags,
      folders: newFolders,
      url: newUrl,
      hasAnnotation: Boolean(hasAnnotation),
      palettes: existing.palettes,
    }

    const compactJson = JSON.stringify(compactObj)

    const updateItem = this.db.prepare(`
      UPDATE items SET
        name = ?,
        tags_json = ?,
        folders_json = ?,
        url = ?,
        has_annotation = ?,
        compact_json = ?
      WHERE library_id = ? AND id = ?
    `)

    const updateDetail = this.db.prepare(`
      INSERT OR REPLACE INTO item_details (library_id, id, annotation, raw_meta_json)
      VALUES (?, ?, ?, NULL)
    `)

    const deleteFts = this.db.prepare(`
      DELETE FROM items_fts WHERE library_id = ? AND id = ?
    `)

    const insertFts = this.db.prepare(`
      INSERT INTO items_fts (library_id, id, name, tags_text, annotation)
      VALUES (?, ?, ?, ?, ?)
    `)

    const tx = this.db.transaction(() => {
      updateItem.run(
        newName,
        JSON.stringify(newTags || []),
        JSON.stringify(newFolders || []),
        newUrl || null,
        hasAnnotation,
        compactJson,
        libraryId,
        id
      )

      if (hasAnnotation) {
        updateDetail.run(libraryId, id, newAnnotation)
      } else {
        this.db.prepare('DELETE FROM item_details WHERE library_id = ? AND id = ?').run(libraryId, id)
      }

      deleteFts.run(libraryId, id)
      const tagsText = (newTags || []).join(' ')
      insertFts.run(libraryId, id, newName, tagsText, newAnnotation || '')
    })

    tx()
    invalidateCatalogCache()
    return true
  }

  /**
   * Returns items that do not yet have a split-toning profile computed.
   */
  getItemsPendingSplitToning(libraryId: string, limit = 500): Array<{
    id: string
    thumbRelPath: string | null
    mediaRelPath: string
    paletteJson: string | null
    compactJson: string
  }> {
    return this.db.prepare(`
      SELECT id, thumb_rel_path as thumbRelPath, media_rel_path as mediaRelPath,
             palette_json as paletteJson, compact_json as compactJson
      FROM items
      WHERE library_id = ? AND split_toning_json IS NULL AND is_deleted = 0
      LIMIT ?
    `).all(libraryId, limit) as any[]
  }

  /**
   * Batch updates split-toning profiles and synchronizes compact_json for instant client retrieval.
   */
  updateSplitToningBatch(
    libraryId: string,
    updates: Array<{ id: string; splitToning: SplitToningProfile }>
  ): number {
    if (updates.length === 0) return 0

    const updateStmt = this.db.prepare(`
      UPDATE items SET
        split_toning_json = @split_toning_json,
        compact_json = @compact_json
      WHERE library_id = @library_id AND id = @id
    `)

    const getItemStmt = this.db.prepare(`
      SELECT compact_json FROM items WHERE library_id = ? AND id = ?
    `)

    let changed = 0
    const tx = this.db.transaction((batch) => {
      for (const item of batch) {
        const row = getItemStmt.get(libraryId, item.id) as { compact_json: string } | undefined
        if (!row) continue
        try {
          const parsed: CompactCatalogItem = JSON.parse(row.compact_json)
          parsed.splitToning = item.splitToning
          const newCompact = JSON.stringify(parsed)
          const info = updateStmt.run({
            library_id: libraryId,
            id: item.id,
            split_toning_json: JSON.stringify(item.splitToning),
            compact_json: newCompact,
          })
          if (info.changes > 0) changed++
        } catch {
          // ignore parse error
        }
      }
    })

    tx(updates)
    invalidateCatalogCache()
    return changed
  }
}
