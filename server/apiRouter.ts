import type { IncomingMessage, ServerResponse } from 'node:http'
import { execFile } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { getSqliteDb } from './db/sqliteClient'
import { CatalogRepository, invalidateCatalogCache } from './db/catalogRepository'
import { EagleLibraryImporter } from './importers/eagleLibraryImporter'
import { getLibrariesConfig, saveLibrariesConfig } from './config/librariesConfig'
import { SidecarManager } from './sidecar/sidecarManager'
import { FolderScanner } from './importers/folderScanner'
import { getLibraryFileWatcher } from './watcher/fileWatcher'
import { backgroundIndexer } from './clip/backgroundIndexer'
import { SplitToningMigrationService } from './db/splitToningMigration'
import { handleMediaStream, clearMediaPathCache, resolveMediaFilePath } from './media/mediaStreamServer'
import { extractComfyMetadataFromPngFile } from './metadata/comfyPngParser'
import { layoutIndexer, handleLayoutBinaryStream } from './layout/layoutIndexer'
import {
  handleEmbeddingsBinaryStream,
  computeClipTextEmbedding,
  computeClipVisualQuery,
} from './clip/clipQueryService'
import {
  getEmbeddingConfig,
  saveEmbeddingConfig,
  type EmbeddingEngineType,
} from './config/embeddingConfig'
import type { ItemMetadataPatch } from '../src/contracts/schemas'

function readRequestBody(req: IncomingMessage, maxBytes = 25 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalBytes = 0
    req.on('data', chunk => {
      totalBytes += chunk.length
      if (totalBytes > maxBytes) {
        req.destroy()
        reject(new Error('Payload too large (limit 25MB)'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export function createCatalogApiMiddleware() {
  const db = getSqliteDb()
  const repo = new CatalogRepository(db)
  const importer = new EagleLibraryImporter(db)
  const fileWatcher = getLibraryFileWatcher(db)
  const splitToningMigrator = new SplitToningMigrationService(db)

  return async function catalogApiMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    if (!req.url || (!req.url.startsWith('/api/catalog/') && !req.url.startsWith('/api/eagle-'))) {
      return next()
    }

    try {
      const url = new URL(req.url, 'http://localhost:5173')
      const pathname = url.pathname

      // 1. GET / PATCH / DELETE /api/catalog/libraries
      if (pathname === '/api/catalog/libraries') {
        if (req.method === 'GET' || !req.method) {
          let libraries = repo.listLibraries()
          const configs = getLibrariesConfig()

          if (libraries.length === 0) {
            for (const cfg of configs) {
              try {
                await importer.importLibrary(cfg.id, { libraryPath: cfg.path })
              } catch (err) {
                console.warn(`[Auto-Import] Failed to import ${cfg.id}:`, err)
              }
            }
            libraries = repo.listLibraries()
          }

          // Merge config hidden/sourceFolderPath flags with SQLite library records
          const configMap = new Map(configs.map(c => [c.id, c]))
          const merged = libraries.map(lib => {
            const cfg = configMap.get(lib.id)
            return {
              ...lib,
              hidden: typeof cfg?.hidden === 'boolean' ? cfg.hidden : Boolean(lib.hidden),
              sourceFolderPath: cfg?.sourceFolderPath || lib.sourceFolderPath,
            }
          })

          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ status: 'success', data: merged }))
          return
        }

        if (req.method === 'PATCH') {
          const bodyBuf = await readRequestBody(req, 1024 * 1024)
          const body = JSON.parse(bodyBuf.toString('utf-8'))
          const { libraryId, hidden, name } = body as {
            libraryId: string
            hidden?: boolean
            name?: string
          }

          if (!libraryId) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ status: 'error', error: 'Missing libraryId' }))
            return
          }

          if (typeof hidden === 'boolean') {
            repo.setLibraryHidden(libraryId, hidden)
          }

          const configs = getLibrariesConfig()
          const entry = configs.find(c => c.id === libraryId)
          if (entry) {
            if (typeof hidden === 'boolean') entry.hidden = hidden
            if (name && name.trim()) entry.name = name.trim()
            saveLibrariesConfig(configs)
          }

          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ status: 'success', data: repo.listLibraries() }))
          return
        }

        if (req.method === 'DELETE') {
          const bodyBuf = await readRequestBody(req, 1024 * 1024)
          const body = JSON.parse(bodyBuf.toString('utf-8'))
          const { libraryId, deleteFilesOnDisk } = body as {
            libraryId: string
            deleteFilesOnDisk?: boolean
          }

          if (!libraryId) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ status: 'error', error: 'Missing libraryId' }))
            return
          }

          // 1. Stop watching & background indexing if active
          fileWatcher.stopWatching(libraryId)
          if (backgroundIndexer.getStatus().libraryId === libraryId) {
            backgroundIndexer.stop()
          }

          const existingLib = repo.getLibrary(libraryId)
          const configs = getLibrariesConfig()
          const cfgEntry = configs.find(c => c.id === libraryId)
          const libPath = existingLib?.path || cfgEntry?.path

          // 2. Delete from SQLite (items, item_details, items_fts, libraries)
          repo.deleteLibraryCascade(libraryId)

          // 3. Remove from .omnimage/libraries.json
          const filteredConfigs = configs.filter(c => c.id !== libraryId)
          saveLibrariesConfig(filteredConfigs)

          // 4. Remove cached taxonomy & embeddings files
          const omnimageDir = path.resolve(process.cwd(), '.omnimage')
          const filesToClean = [
            path.join(omnimageDir, `taxonomy-${libraryId}.json`),
            path.join(omnimageDir, 'embeddings', `embeddings-${libraryId}.bin`),
          ]
          for (const f of filesToClean) {
            if (fs.existsSync(f)) {
              try {
                fs.unlinkSync(f)
              } catch {
                // ignore
              }
            }
          }

          // 5. Optionally delete generated .library folder on disk (never delete original user sourceFolderPath!)
          if (
            deleteFilesOnDisk &&
            libPath &&
            libPath.toLowerCase().endsWith('.library') &&
            !['design', 'google-flow'].includes(libraryId) &&
            fs.existsSync(libPath)
          ) {
            try {
              fs.rmSync(libPath, { recursive: true, force: true })
            } catch (err) {
              console.warn(`[Delete Library] Could not remove ${libPath}:`, err)
            }
          }

          clearMediaPathCache()
          invalidateCatalogCache()

          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ status: 'success', data: repo.listLibraries() }))
          return
        }
      }

      // 2. GET /api/catalog/items OR /api/eagle-items
      if (pathname === '/api/catalog/items' || pathname === '/api/eagle-items') {
        const library = url.searchParams.get('library') || 'design'
        const rawLimit = parseInt(url.searchParams.get('limit') || '50000', 10)
        const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50000) : 50000
        const q = (url.searchParams.get('q') || '').trim()
        const refresh = url.searchParams.get('refresh') === '1' || url.searchParams.get('refresh') === 'true'

        if (refresh) {
          invalidateCatalogCache()
        }

        const configs = getLibrariesConfig()
        const config = configs.find(c => c.id === library)

        // Only auto-seed if library is configured and empty
        if (repo.countItems(library) === 0 && config) {
          try {
            await importer.importLibrary(library, { libraryPath: config.path })
          } catch (err) {
            console.warn(`[Catalog] Failed auto-seed for ${library}:`, err)
          }
        }

        const acceptEncoding = String(req.headers['accept-encoding'] || '')
        const supportsGzip = acceptEncoding.includes('gzip')

        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Vary', 'Accept-Encoding')

        if (q) {
          // Instant SQLite FTS5 search
          const searchResult = repo.searchItemsFts(library, q, limit)
          res.setHeader('Content-Length', searchResult.raw.length)
          res.end(searchResult.raw)
          return
        }

        // Full compact listing: zero JSON.stringify overhead
        const payload = repo.getCompactJsonPayload(library, limit)
        if (supportsGzip) {
          res.setHeader('Content-Encoding', 'gzip')
          res.setHeader('Content-Length', payload.gzip.length)
          res.end(payload.gzip)
        } else {
          res.setHeader('Content-Length', payload.raw.length)
          res.end(payload.raw)
        }
        return
      }

      // 3. GET /api/catalog/taxonomy OR /api/eagle-folders
      if (pathname === '/api/catalog/taxonomy' || pathname === '/api/eagle-folders') {
        const library = url.searchParams.get('library') || 'design'
        const refresh = url.searchParams.get('refresh') === '1' || url.searchParams.get('refresh') === 'true'

        const omnimageDir = path.resolve(process.cwd(), '.omnimage')
        const sidecarFile = path.join(omnimageDir, `taxonomy-${library}.json`)

        if (!refresh && fs.existsSync(sidecarFile)) {
          const content = fs.readFileSync(sidecarFile, 'utf-8')
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(content)
          return
        }

        const configs = getLibrariesConfig()
        const config = configs.find(c => c.id === library)
        const rootPath = config?.path || ''
        const taxonomy = importer.exportTaxonomySidecar(library, rootPath)

        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(taxonomy || { status: 'error', error: 'Taxonomy not available' }))
        return
      }

      // 4. GET /api/catalog/item-detail
      if (pathname === '/api/catalog/item-detail') {
        const library = url.searchParams.get('library') || 'design'
        const id = url.searchParams.get('id')
        if (!id) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ status: 'error', error: 'Missing id parameter' }))
          return
        }

        const detail = repo.getItemDetail(library, id)
        if (!detail) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ status: 'error', error: 'Item not found' }))
          return
        }

        if ((detail.ext || '').toLowerCase() === 'png') {
          const mediaPath = resolveMediaFilePath(library, id, 'full')
          if (mediaPath) {
            const comfy = extractComfyMetadataFromPngFile(mediaPath)
            if (comfy && comfy.hasWorkflow) {
              detail.comfy = comfy
              if (!detail.annotation && comfy.positivePrompt) {
                detail.annotation = comfy.positivePrompt
              }
            }
          }
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ status: 'success', data: detail }))
        return
      }

      // 5. GET /api/catalog/reveal OR POST /api/catalog/item-action OR /api/eagle-item-action
      if (
        pathname === '/api/catalog/reveal' ||
        pathname === '/api/catalog/item-action' ||
        pathname === '/api/eagle-item-action'
      ) {
        let library = url.searchParams.get('library') || 'design'
        let id = url.searchParams.get('id')
        let action = url.searchParams.get('action') || (pathname.endsWith('reveal') ? 'reveal' : 'info')

        if (req.method === 'POST') {
          const bodyBuf = await readRequestBody(req, 1024 * 1024)
          try {
            const body = JSON.parse(bodyBuf.toString('utf-8'))
            if (body.library) library = body.library
            if (body.id) id = body.id
            if (body.action) action = body.action
          } catch {
            // ignore
          }
        }

        if (!id) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, error: 'Missing id parameter' }))
          return
        }

        const detail = repo.getItemDetail(library, id)
        const resolvedMedia = resolveMediaFilePath(library, id, 'full')
        const configs = getLibrariesConfig()
        const config = configs.find(c => c.id === library)
        const rootPath = config?.path || ''
        const fullFilePath =
          resolvedMedia ||
          (detail?.filePath
            ? path.resolve(rootPath, detail.filePath)
            : path.join(rootPath, 'images', `${id}.info`))

        if (action === 'reveal') {
          const winPath = fullFilePath.replace(/\//g, '\\')
          try {
            execFile('explorer.exe', [`/select,${winPath}`])
          } catch {
            // ignore explorer exit code
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, status: 'success', filePath: winPath }))
          return
        }

        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({
          ok: true,
          status: 'success',
          filePath: fullFilePath.replace(/\//g, '\\'),
          detail,
        }))
        return
      }

      // 6. GET /api/catalog/media OR /api/eagle-media
      if (pathname === '/api/catalog/media' || pathname === '/api/eagle-media') {
        const library = url.searchParams.get('library') || 'design'
        const id = url.searchParams.get('id') || ''
        const type = (url.searchParams.get('type') || 'thumb') as 'thumb' | 'full'

        await handleMediaStream(req, res, library, id, type)
        return
      }

      // 7. GET /api/catalog/embeddings OR /api/eagle-embeddings
      if (pathname === '/api/catalog/embeddings' || pathname === '/api/eagle-embeddings') {
        const library = url.searchParams.get('library') || 'design'
        const engineParam = url.searchParams.get('engine') as EmbeddingEngineType | null
        await handleEmbeddingsBinaryStream(req, res, library, engineParam || undefined, db)
        return
      }

      // 7.1 GET /api/catalog/layout-vectors OR /api/eagle-layout-vectors
      if (pathname === '/api/catalog/layout-vectors' || pathname === '/api/eagle-layout-vectors') {
        const library = url.searchParams.get('library') || 'design'
        await handleLayoutBinaryStream(req, res, library)
        return
      }

      // 8. POST /api/catalog/clip-text OR /api/eagle-clip-text OR /api/eagle-text-embedding
      if (
        pathname === '/api/catalog/clip-text' ||
        pathname === '/api/eagle-clip-text' ||
        pathname === '/api/eagle-text-embedding'
      ) {
        let queryText = ''
        if (req.method === 'GET') {
          queryText = url.searchParams.get('q') || url.searchParams.get('text') || ''
        } else {
          const bodyBuf = await readRequestBody(req, 1024 * 1024)
          try {
            const body = JSON.parse(bodyBuf.toString('utf-8'))
            queryText = body.query || body.text || body.q || ''
          } catch {
            queryText = bodyBuf.toString('utf-8')
          }
        }

        if (!queryText.trim()) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ status: 'error', error: 'Query text is required' }))
          return
        }

        const queryEngine = (url.searchParams.get('engine') as EmbeddingEngineType) || undefined
        const result = await computeClipTextEmbedding(queryText, queryEngine)
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({
          status: 'success',
          query: queryText,
          embedding: Array.from(result.embedding),
          dim: result.dim,
          engine: queryEngine || getEmbeddingConfig().engine,
        }))
        return
      }

      // 9. POST /api/catalog/clip-visual OR /api/eagle-clip-visual OR /api/eagle-visual-query
      if (
        pathname === '/api/catalog/clip-visual' ||
        pathname === '/api/eagle-clip-visual' ||
        pathname === '/api/eagle-visual-query'
      ) {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ status: 'error', error: 'Method not allowed. Use POST.' }))
          return
        }

        const bodyBuf = await readRequestBody(req, 25 * 1024 * 1024)
        const contentType = String(req.headers['content-type'] || '').toLowerCase()
        let imageBuffer: Buffer | null = null

        if (contentType.includes('application/json')) {
          const body = JSON.parse(bodyBuf.toString('utf-8'))
          if (body.image && typeof body.image === 'string') {
            const b64Data = body.image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
            imageBuffer = Buffer.from(b64Data, 'base64')
          } else if (body.dataUrl && typeof body.dataUrl === 'string') {
            const b64Data = body.dataUrl.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
            imageBuffer = Buffer.from(b64Data, 'base64')
          } else if (body.url && typeof body.url === 'string') {
            const fetched = await fetch(body.url)
            if (fetched.ok) {
              const arr = await fetched.arrayBuffer()
              imageBuffer = Buffer.from(arr)
            }
          }
        } else if (contentType.includes('multipart/form-data')) {
          const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
          if (boundaryMatch) {
            const boundary = boundaryMatch[1] || boundaryMatch[2]
            const raw = bodyBuf.toString('binary')
            const parts = raw.split(`--${boundary}`)
            for (const part of parts) {
              if (part.includes('filename=') || part.includes('name="image"')) {
                const headerEnd = part.indexOf('\r\n\r\n')
                if (headerEnd !== -1) {
                  const content = part.slice(headerEnd + 4, part.lastIndexOf('\r\n'))
                  imageBuffer = Buffer.from(content, 'binary')
                  break
                }
              }
            }
          }
        } else {
          imageBuffer = bodyBuf
        }

        if (!imageBuffer || imageBuffer.length === 0) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ status: 'error', error: 'No valid image provided' }))
          return
        }

        const visualEngine = (url.searchParams.get('engine') as EmbeddingEngineType) || undefined
        const visualResult = await computeClipVisualQuery(imageBuffer, visualEngine)
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({
          status: 'success',
          embedding: Array.from(visualResult.embedding),
          engine: visualEngine || getEmbeddingConfig().engine,
          width: visualResult.width,
          height: visualResult.height,
          aspectRatio: visualResult.aspectRatio,
          dominantColor: visualResult.paletteData.dominantColor,
          palette: visualResult.paletteData.palette,
          paletteWeights: visualResult.paletteData.paletteWeights,
          splitToning: visualResult.paletteData.splitToning,
        }))
        return
      }

      // 10. PATCH /api/catalog/item-metadata (Dual-Write: .library/images/{id}.info/metadata.json + Sidecar + SQLite)
      if (pathname === '/api/catalog/item-metadata' && req.method === 'PATCH') {
        const bodyBuf = await readRequestBody(req, 1024 * 1024)
        const body = JSON.parse(bodyBuf.toString('utf-8'))
        const { library, id, patch } = body as { library: string; id: string; patch: ItemMetadataPatch }

        if (!library || !id || !patch) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ status: 'error', error: 'Missing library, id or patch' }))
          return
        }

        const configs = getLibrariesConfig()
        const config = configs.find(c => c.id === library)
        if (config?.path && fs.existsSync(config.path)) {
          // 1A. Update Eagle-style images/{id}.info/metadata.json
          const infoMetaPath = path.join(config.path, 'images', `${id}.info`, 'metadata.json')
          if (fs.existsSync(infoMetaPath)) {
            try {
              const infoMeta = JSON.parse(fs.readFileSync(infoMetaPath, 'utf-8'))
              if (patch.name !== undefined) infoMeta.name = patch.name
              if (patch.tags !== undefined) infoMeta.tags = patch.tags
              if (patch.folders !== undefined) infoMeta.folders = patch.folders
              if (patch.annotation !== undefined) infoMeta.annotation = patch.annotation
              if (patch.url !== undefined) infoMeta.url = patch.url
              infoMeta.modificationTime = Date.now()
              const tmpInfoPath = `${infoMetaPath}.tmp`
              fs.writeFileSync(tmpInfoPath, JSON.stringify(infoMeta, null, 2), 'utf-8')
              fs.renameSync(tmpInfoPath, infoMetaPath)
            } catch {
              // ignore
            }
          }

          // 1B. Update .omnimage sidecar if present
          const sidecarMgr = new SidecarManager(config.path)
          const existing = sidecarMgr.readItemSidecar(id)
          if (existing) {
            if (patch.name !== undefined) existing.name = patch.name
            if (patch.tags !== undefined) existing.tags = patch.tags
            if (patch.folders !== undefined) existing.folders = patch.folders
            if (patch.annotation !== undefined) existing.annotation = patch.annotation
            if (patch.url !== undefined) existing.url = patch.url
            sidecarMgr.saveItemSidecar(existing)
          }
        }

        // 2. Dual-Write: Update SQLite items + FTS5
        const success = repo.updateItemMetadata(library, id, patch)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ status: success ? 'success' : 'not_found' }))
        return
      }

      // 11. GET /api/catalog/indexer-status
      if (pathname === '/api/catalog/indexer-status') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ status: 'success', data: backgroundIndexer.getStatus() }))
        return
      }

      // 12. POST /api/catalog/start-indexing
      if (pathname === '/api/catalog/start-indexing' && req.method === 'POST') {
        const bodyBuf = await readRequestBody(req, 1024 * 1024)
        const body = JSON.parse(bodyBuf.toString('utf-8'))
        const libraryId = body.library || 'design'
        const engineParam = body.engine as EmbeddingEngineType | undefined

        // Run non-blocking
        backgroundIndexer.startIndexing(libraryId, db, engineParam).catch(console.error)

        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ status: 'success', message: `Started indexing for ${libraryId}` }))
        return
      }

      // 12.1 GET & POST /api/catalog/embedding-config
      if (pathname === '/api/catalog/embedding-config') {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ status: 'success', data: getEmbeddingConfig() }))
          return
        }

        if (req.method === 'POST') {
          const bodyBuf = await readRequestBody(req, 1024 * 1024)
          const body = JSON.parse(bodyBuf.toString('utf-8'))
          const updated = saveEmbeddingConfig(body)
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ status: 'success', data: updated }))
          return
        }

        res.statusCode = 405
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ status: 'error', error: 'Method not allowed' }))
        return
      }

      // 12.1 GET /api/catalog/split-toning-status
      if (pathname === '/api/catalog/split-toning-status') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ status: 'success', data: splitToningMigrator.getProgress() }))
        return
      }

      // 12.2 POST /api/catalog/migrate-split-toning
      if (pathname === '/api/catalog/migrate-split-toning' && req.method === 'POST') {
        const bodyBuf = await readRequestBody(req, 1024 * 1024)
        const body = JSON.parse(bodyBuf.toString('utf-8'))
        const libraryId = body.library || 'design'

        // Run non-blocking
        splitToningMigrator.runMigration(libraryId).catch(console.error)

        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ status: 'success', message: `Started split-toning migration for ${libraryId}` }))
        return
      }

      // 12.3 GET /api/catalog/layout-indexer-status
      if (pathname === '/api/catalog/layout-indexer-status') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ status: 'success', data: layoutIndexer.getStatus() }))
        return
      }

      // 12.4 POST /api/catalog/start-layout-indexing
      if (pathname === '/api/catalog/start-layout-indexing' && req.method === 'POST') {
        const bodyBuf = await readRequestBody(req, 1024 * 1024)
        const body = JSON.parse(bodyBuf.toString('utf-8'))
        const libraryId = body.library || 'design'

        // Run non-blocking in background
        layoutIndexer.startIndexing(libraryId, db).catch(console.error)

        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ status: 'success', message: `Started layout indexing for ${libraryId}` }))
        return
      }

      // 13. POST /api/catalog/scan-folder (Creates/Updates an Eagle-style .library from any folder)
      if (pathname === '/api/catalog/scan-folder' && req.method === 'POST') {
        const bodyBuf = await readRequestBody(req, 1024 * 1024)
        const body = JSON.parse(bodyBuf.toString('utf-8'))
        const { libraryId, folderPath, importMode } = body as {
          libraryId: string
          folderPath: string
          importMode?: 'hardlink' | 'copy'
        }

        if (!libraryId || !folderPath) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ status: 'error', error: 'Missing libraryId or folderPath' }))
          return
        }

        // Check if user selected an already existing Eagle .library folder directly
        const isExistingEagleLib =
          folderPath.toLowerCase().endsWith('.library') &&
          fs.existsSync(path.join(folderPath, 'images'))

        if (isExistingEagleLib) {
          const configs = getLibrariesConfig()
          const existingIdx = configs.findIndex(c => c.id === libraryId)
          const entry = {
            id: libraryId,
            name: path.basename(folderPath),
            path: folderPath,
            type: 'eagle-library' as const,
            hidden: false,
          }
          if (existingIdx >= 0) {
            configs[existingIdx] = entry
          } else {
            configs.push(entry)
          }
          saveLibrariesConfig(configs)

          const importRes = await importer.importLibrary(libraryId, {
            libraryPath: folderPath,
            force: true,
          })

          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              status: 'success',
              totalItems: importRes.importedCount,
              newItems: importRes.importedCount,
              libraryPath: folderPath,
            })
          )
          return
        }

        // Regular folder: Build/Sync Eagle-style `{Name}.library`
        const scanner = new FolderScanner(db)
        const scanResult = await scanner.scanFolder(libraryId, folderPath, {
          importMode: importMode || 'hardlink',
        })

        // Save/update in .omnimage/libraries.json pointing `path` to the generated `.library`
        const configs = getLibrariesConfig()
        const existingIdx = configs.findIndex(c => c.id === libraryId)
        const entry = {
          id: libraryId,
          name: path.basename(scanResult.libraryPath),
          path: scanResult.libraryPath,
          sourceFolderPath: folderPath,
          type: 'eagle-library' as const,
          hidden: false,
        }
        if (existingIdx >= 0) {
          configs[existingIdx] = entry
        } else {
          configs.push(entry)
        }
        saveLibrariesConfig(configs)

        // Start real-time watcher on the source folder to auto-ingest new files into the .library
        fileWatcher.startWatching(libraryId, folderPath, scanResult.libraryPath)

        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ status: 'success', ...scanResult }))
        return
      }

      next()
    } catch (err: any) {
      console.error('[API Router Error]:', err)
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ status: 'error', error: err?.message || String(err) }))
      }
    }
  }
}
