import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { computeClipVisualQuery, resolveEmbeddingsFilePath } from './clipQueryService'
import { getLibrariesConfig } from '../config/librariesConfig'
import { getEmbeddingConfig, type EmbeddingEngineType } from '../config/embeddingConfig'
import { getEmbeddingEngine } from './engines/engineRegistry'
import { serializeEmbeddingsBinary, parseEmbeddingsBinary } from '../../src/contracts/binaryFormats'

export interface IndexerStatus {
  state: 'idle' | 'indexing'
  libraryId: string | null
  engine: EmbeddingEngineType
  processed: number
  total: number
  rateImgPerSec: number
}

export function buildItemDocument(item: {
  name?: string
  tagsJson?: string | null
  annotation?: string | null
}): string {
  const parts: string[] = []
  const title = (item.name || '').trim()
  if (title) parts.push(`title: ${title}`)

  if (item.tagsJson) {
    try {
      const parsed = JSON.parse(item.tagsJson)
      if (Array.isArray(parsed) && parsed.length > 0) {
        parts.push(`tags: ${parsed.join(', ')}`)
      }
    } catch {
      // ignore
    }
  }

  const annot = (item.annotation || '').trim()
  if (annot) {
    if (annot.startsWith('{') && annot.includes('"')) {
      try {
        const parsed = JSON.parse(annot)
        if (parsed.prompt && typeof parsed.prompt === 'string') {
          parts.push(`prompt: ${parsed.prompt.slice(0, 500)}`)
        } else if (parsed.positive && typeof parsed.positive === 'string') {
          parts.push(`prompt: ${parsed.positive.slice(0, 500)}`)
        } else if (parsed.metadata?.archive_tag) {
          parts.push(`tag: ${parsed.metadata.archive_tag}`)
        } else {
          const promptMatch = annot.match(/"(?:prompt|positive|text)":\s*"([^"]+)"/i)
          if (promptMatch && promptMatch[1]) {
            parts.push(`prompt: ${promptMatch[1].slice(0, 500)}`)
          } else {
            parts.push(`metadata: ${annot.slice(0, 300)}`)
          }
        }
      } catch {
        parts.push(`prompt: ${annot.slice(0, 500)}`)
      }
    } else {
      parts.push(`prompt: ${annot.slice(0, 500)}`)
    }
  }

  return parts.length > 0 ? parts.join(' | ') : 'untitled item'
}

class BackgroundIndexer {
  private status: IndexerStatus = {
    state: 'idle',
    libraryId: null,
    engine: 'clip-vit-b32',
    processed: 0,
    total: 0,
    rateImgPerSec: 0,
  }

  private isRunning = false
  private stopRequested = false

  getStatus(): IndexerStatus {
    return { ...this.status }
  }

  async startIndexing(
    libraryId: string,
    db: Database.Database,
    engineType?: EmbeddingEngineType
  ): Promise<void> {
    if (this.isRunning) {
      return
    }

    const activeEngine = engineType || getEmbeddingConfig().engine
    const engineInstance = await getEmbeddingEngine(activeEngine)

    this.isRunning = true
    this.stopRequested = false

    const configs = getLibrariesConfig()
    const config = configs.find((c) => c.id === libraryId)
    const rootPath = config?.path || ''

    try {
      // Find items in library joined with annotation text from indexed item_details
      const rows = db.prepare(
        `SELECT i.id, i.name, i.tags_json AS tagsJson, i.thumb_rel_path, i.media_rel_path,
                COALESCE(d.annotation, '') AS annotation
         FROM items i
         LEFT JOIN item_details d ON d.library_id = i.library_id AND d.id = i.id
         WHERE i.library_id = ? AND i.is_deleted = 0
         ORDER BY i.rowid ASC`
      ).all(libraryId) as {
        id: string
        name: string
        tagsJson?: string | null
        thumb_rel_path?: string | null
        media_rel_path: string
        annotation?: string | null
      }[]

      this.status = {
        state: 'indexing',
        libraryId,
        engine: activeEngine,
        processed: 0,
        total: rows.length,
        rateImgPerSec: 0,
      }

      const suffix = activeEngine === 'embeddinggemma-2' ? '.gemma2' : ''
      const defaultFileName = `embeddings-${libraryId}${suffix}.bin`
      const embFile =
        resolveEmbeddingsFilePath(libraryId, activeEngine) ||
        path.resolve(process.cwd(), '.omnimage/embeddings', defaultFileName)
      const embDir = path.dirname(embFile)
      if (!fs.existsSync(embDir)) {
        fs.mkdirSync(embDir, { recursive: true })
      }

      // Check if existing file can be parsed
      const existingIdMap = new Map<string, number>()
      let existingIds: string[] = []
      let existingVectors: Int8Array = new Int8Array(0)

      if (fs.existsSync(embFile)) {
        try {
          const fileBuf = fs.readFileSync(embFile)
          const parsed = parseEmbeddingsBinary(
            fileBuf.buffer.slice(fileBuf.byteOffset, fileBuf.byteOffset + fileBuf.byteLength)
          )
          existingIds = parsed.ids
          existingVectors = parsed.vectors
          for (let idx = 0; idx < parsed.ids.length; idx++) {
            existingIdMap.set(parsed.ids[idx], idx)
          }
        } catch {
          // If unparsed raw format without header, check if row-aligned
          const stat = fs.statSync(embFile)
          const rawCount = Math.floor(stat.size / 512)
          if (rawCount > 0 && stat.size % 512 === 0) {
            const rawBytes = fs.readFileSync(embFile)
            existingVectors = new Int8Array(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength)
            existingIds = rows.slice(0, rawCount).map((r) => r.id)
            for (let idx = 0; idx < existingIds.length; idx++) {
              existingIdMap.set(existingIds[idx], idx)
            }
          }
        }
      }

      const finalIds: string[] = []
      const vectorChunks: Int8Array[] = []
      const startTime = Date.now()
      let newlyProcessed = 0
      let lastCheckpoint = 0

      const isTextModality = engineInstance.modality === 'text'
      const BATCH_SIZE = 16

      const saveCheckpoint = async () => {
        const count = vectorChunks.length
        if (count === 0) return
        const partialVectors = new Int8Array(count * 512)
        for (let idx = 0; idx < count; idx++) {
          partialVectors.set(vectorChunks[idx], idx * 512)
        }
        const pkg = serializeEmbeddingsBinary(finalIds, partialVectors, 512)
        const tmpPath = `${embFile}.tmp`
        await fs.promises.writeFile(tmpPath, Buffer.from(pkg))
        await fs.promises.rename(tmpPath, embFile)
      }

      let i = 0
      while (i < rows.length) {
        if (this.stopRequested) break

        if (isTextModality && typeof engineInstance.computeBatchTextEmbeddings === 'function') {
          const batchItems: typeof rows = []
          const batchItemIndices: number[] = []

          while (batchItems.length < BATCH_SIZE && i < rows.length) {
            const item = rows[i]
            finalIds.push(item.id)
            const existingIdx = existingIdMap.get(item.id)
            if (existingIdx !== undefined && (existingIdx + 1) * 512 <= existingVectors.length) {
              const slice = existingVectors.subarray(existingIdx * 512, (existingIdx + 1) * 512)
              vectorChunks.push(slice)
              this.status.processed = i + 1
              i++
            } else {
              batchItems.push(item)
              batchItemIndices.push(i)
              i++
            }
          }

          if (batchItems.length > 0) {
            const docs = batchItems.map(buildItemDocument)
            try {
              const batchVectors = await engineInstance.computeBatchTextEmbeddings(docs)
              for (let b = 0; b < batchItems.length; b++) {
                vectorChunks.push(batchVectors[b] || new Int8Array(512))
                newlyProcessed++
                this.status.processed = batchItemIndices[b] + 1
              }
            } catch {
              for (let b = 0; b < batchItems.length; b++) {
                try {
                  const res = await engineInstance.computeTextEmbedding(docs[b])
                  vectorChunks.push(res.embedding)
                } catch {
                  vectorChunks.push(new Int8Array(512))
                }
                newlyProcessed++
                this.status.processed = batchItemIndices[b] + 1
              }
            }

            const elapsedSec = (Date.now() - startTime) / 1000
            if (elapsedSec > 0) {
              this.status.rateImgPerSec = Number((newlyProcessed / elapsedSec).toFixed(1))
            }

            if (newlyProcessed - lastCheckpoint >= 250) {
              lastCheckpoint = newlyProcessed
              await saveCheckpoint()
            }

            await new Promise((r) => setImmediate(r))
          }
        } else {
          const item = rows[i]
          finalIds.push(item.id)

          const existingIdx = existingIdMap.get(item.id)
          if (existingIdx !== undefined && (existingIdx + 1) * 512 <= existingVectors.length) {
            const slice = existingVectors.subarray(existingIdx * 512, (existingIdx + 1) * 512)
            vectorChunks.push(slice)
          } else {
            if (isTextModality) {
              const docText = buildItemDocument(item)
              try {
                const res = await engineInstance.computeTextEmbedding(docText)
                vectorChunks.push(res.embedding)
              } catch {
                vectorChunks.push(new Int8Array(512))
              }
            } else {
              const thumbCandidate = item.thumb_rel_path
                ? path.resolve(rootPath, item.thumb_rel_path)
                : path.resolve(rootPath, item.media_rel_path)

              if (fs.existsSync(thumbCandidate)) {
                try {
                  const buf = await fs.promises.readFile(thumbCandidate)
                  const visual = await computeClipVisualQuery(buf, activeEngine)
                  vectorChunks.push(visual.embedding)
                } catch {
                  vectorChunks.push(new Int8Array(512))
                }
              } else {
                vectorChunks.push(new Int8Array(512))
              }
            }
            newlyProcessed++
          }

          this.status.processed = i + 1
          const elapsedSec = (Date.now() - startTime) / 1000
          if (elapsedSec > 0) {
            this.status.rateImgPerSec = Number((newlyProcessed / elapsedSec).toFixed(1))
          }

          if (newlyProcessed - lastCheckpoint >= 250) {
            lastCheckpoint = newlyProcessed
            await saveCheckpoint()
          }

          if (i % 25 === 0) {
            await new Promise((r) => setImmediate(r))
          }
          i++
        }
      }

      // Final save
      await saveCheckpoint()
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
