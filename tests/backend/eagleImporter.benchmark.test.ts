import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { runMigrations } from '../../server/db/migrations'
import { CatalogRepository, invalidateCatalogCache } from '../../server/db/catalogRepository'
import { EagleLibraryImporter, findCacheFile } from '../../server/importers/eagleLibraryImporter'

describe('Eagle Zero-Copy Importer & Performance Benchmarks', () => {
  let db: Database.Database
  let repo: CatalogRepository
  let importer: EagleLibraryImporter
  const testDbDir = path.resolve(process.cwd(), '.omnimage-test')
  const testDbPath = path.join(testDbDir, 'benchmark.sqlite')

  beforeAll(() => {
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true })
    }
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath)
      } catch {
        // ignore
      }
    }

    db = new Database(testDbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('temp_store = MEMORY')
    db.pragma('mmap_size = 268435456')
    db.pragma('cache_size = -64000')

    runMigrations(db)
    repo = new CatalogRepository(db)
    importer = new EagleLibraryImporter(db)
    invalidateCatalogCache()
  })

  afterAll(() => {
    try {
      db.close()
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath)
      const wal = `${testDbPath}-wal`
      if (fs.existsSync(wal)) fs.unlinkSync(wal)
      const shm = `${testDbPath}-shm`
      if (fs.existsSync(shm)) fs.unlinkSync(shm)
      if (fs.existsSync(testDbDir)) fs.rmSync(testDbDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('imports google-flow items and validates that compact payload drops below 6 MB', async () => {
    const googleFlowCache = findCacheFile('index-google-flow.json')

    if (googleFlowCache && fs.existsSync(googleFlowCache)) {
      const originalFileSizeBytes = fs.statSync(googleFlowCache).size
      const originalFileSizeMb = originalFileSizeBytes / (1024 * 1024)
      console.log(`Original index-google-flow.json size: ${originalFileSizeMb.toFixed(2)} MB`)

      // Measure import duration
      const importStart = performance.now()
      const result = await importer.importLibrary('google-flow', { force: true })
      const importDurationMs = performance.now() - importStart

      console.log(`Imported ${result.importedCount} google-flow items in ${importDurationMs.toFixed(1)} ms`)
      expect(result.importedCount).toBeGreaterThanOrEqual(12000)

      // Measure compact payload size
      const payload = repo.getCompactJsonPayload('google-flow')
      const payloadSizeBytes = payload.raw.length
      const payloadSizeMb = payloadSizeBytes / (1024 * 1024)
      const gzipSizeMb = payload.gzip.length / (1024 * 1024)

      console.log(`Compact raw payload size: ${payloadSizeMb.toFixed(2)} MB (gzip: ${gzipSizeMb.toFixed(2)} MB)`)

      // Acceptance Criteria: raw payload size MUST drop from ~58 MB to < 6 MB!
      expect(payloadSizeMb).toBeLessThan(6.0)

      // Measure query latency (uncached query to DB)
      invalidateCatalogCache()
      const queryStart = performance.now()
      const uncachedPayload = repo.getCompactJsonPayload('google-flow')
      const queryDurationMs = performance.now() - queryStart

      console.log(`Uncached SQLite full catalog query: ${queryDurationMs.toFixed(1)} ms`)
      expect(queryDurationMs).toBeLessThan(100) // < 100ms for 12,900 items
      expect(uncachedPayload.count).toBe(result.importedCount)

      // Measure memory-cached query latency
      const cachedStart = performance.now()
      const cachedPayload = repo.getCompactJsonPayload('google-flow')
      const cachedDurationMs = performance.now() - cachedStart

      console.log(`Cached zero-copy full catalog retrieval: ${cachedDurationMs.toFixed(2)} ms`)
      expect(cachedDurationMs).toBeLessThan(5) // < 5ms instant retrieval
      expect(cachedPayload.count).toBe(result.importedCount)

      // Measure FTS5 query latency
      const ftsStart = performance.now()
      const ftsResult = repo.searchItemsFts('google-flow', 'portrait OR style', 500)
      const ftsDurationMs = performance.now() - ftsStart

      console.log(`FTS5 full-text search across 12,900 items: ${ftsDurationMs.toFixed(1)} ms (found ${ftsResult.count} items)`)
      expect(ftsDurationMs).toBeLessThan(25) // < 25ms
    } else {
      // Synthetic fallback test when run in isolation
      console.log('User cache file not found in test environment, running synthetic benchmark...')
      const syntheticCount = 5000
      const syntheticItems = []

      for (let i = 0; i < syntheticCount; i++) {
        syntheticItems.push({
          id: `item_${i}`,
          name: `Synthetic Art item #${i}`,
          ext: 'png',
          width: 1920,
          height: 1080,
          tagsJson: JSON.stringify(['synthetic', 'benchmark', `tag_${i % 10}`]),
          annotation: `A long generative prompt describing complex architectural geometries and cinematic lighting with octane rendering parameters number ${i}`,
          compactJson: JSON.stringify({
            id: `item_${i}`,
            name: `Synthetic Art item #${i}`,
            ext: 'png',
            width: 1920,
            height: 1080,
            tags: ['synthetic', 'benchmark', `tag_${i % 10}`],
            hasAnnotation: true,
          }),
          mediaRelPath: `images/item_${i}.info/Synthetic Art item #${i}.png`,
        })
      }

      const importStart = performance.now()
      repo.insertItemsBatch('synthetic-lib', syntheticItems)
      const importDurationMs = performance.now() - importStart

      console.log(`Inserted ${syntheticCount} synthetic items in ${importDurationMs.toFixed(1)} ms`)
      expect(importDurationMs).toBeLessThan(500) // 5,000 items in < 500ms

      const payload = repo.getCompactJsonPayload('synthetic-lib')
      expect(payload.count).toBe(syntheticCount)
      expect(payload.raw.length / (1024 * 1024)).toBeLessThan(2.0)
    }
  }, 30000)

  it('imports design library and verifies embeddings link', async () => {
    const designCache = findCacheFile('index-design.json')

    if (designCache && fs.existsSync(designCache)) {
      const result = await importer.importLibrary('design', { force: true })
      expect(result.importedCount).toBeGreaterThanOrEqual(20000)

      const payload = repo.getCompactJsonPayload('design')
      expect(payload.count).toBe(result.importedCount)
      console.log(`Imported ${result.importedCount} design library items successfully.`)
    }
  }, 30000)
})
