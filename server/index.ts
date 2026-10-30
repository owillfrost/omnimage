import http from 'node:http'
import { getSqliteDb } from './db/sqliteClient'
import { runMigrations } from './db/migrations'
import { createCatalogApiMiddleware } from './apiRouter'
import { EagleLibraryImporter } from './importers/eagleLibraryImporter'
import { getLibrariesConfig } from './config/librariesConfig'
import { startConfiguredWatchers, stopAllLibraryWatchers, getLibraryFileWatcher } from './watcher/fileWatcher'

export { getSqliteDb, closeSqliteDb } from './db/sqliteClient'
export { CatalogRepository, invalidateCatalogCache } from './db/catalogRepository'
export { EagleLibraryImporter } from './importers/eagleLibraryImporter'
export { createCatalogApiMiddleware } from './apiRouter'
export { handleMediaStream } from './media/mediaStreamServer'
export {
  computeClipTextEmbedding,
  computeClipVisualQuery,
  handleEmbeddingsBinaryStream,
} from './clip/clipQueryService'
export { getLibraryFileWatcher, startConfiguredWatchers, stopAllLibraryWatchers } from './watcher/fileWatcher'

export function initializeBackend(customDbPath?: string) {
  const db = getSqliteDb(customDbPath)
  runMigrations(db)
  startConfiguredWatchers(db)
  return { db }
}

export async function autoSeedLibrariesIfEmpty() {
  const { db } = initializeBackend()
  const importer = new EagleLibraryImporter(db)
  const configs = getLibrariesConfig()

  for (const cfg of configs) {
    try {
      await importer.importLibrary(cfg.id, { libraryPath: cfg.path })
    } catch (err) {
      console.warn(`[Auto-Seed] Warning importing ${cfg.id}:`, err)
    }
  }
}

export function startStandaloneServer(port = 41596): http.Server {
  initializeBackend()
  const middleware = createCatalogApiMiddleware()

  const server = http.createServer((req, res) => {
    middleware(req, res, () => {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/plain')
      res.end('Not Found')
    })
  })

  server.listen(port, () => {
    console.log(`[Omnimage Catalog Server] Listening on http://localhost:${port}`)
  })

  return server
}
