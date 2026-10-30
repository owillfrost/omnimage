import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../server/db/migrations'
import { EagleLibraryImporter } from '../../server/importers/eagleLibraryImporter'
import { CatalogRepository, invalidateCatalogCache } from '../../server/db/catalogRepository'
import fs from 'node:fs'
import path from 'node:path'

describe('EagleLibraryImporter Concurrency & Deduplication Tests (Item 14)', () => {
  let db: Database.Database
  let repo: CatalogRepository
  let importer: EagleLibraryImporter
  const testOmnimageDir = path.resolve(process.cwd(), '.omnimage')

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
    repo = new CatalogRepository(db)
    importer = new EagleLibraryImporter(db)
    invalidateCatalogCache()
  })

  afterEach(() => {
    db.close()
  })

  it('deduplicates concurrent in-flight calls to importLibrary for the same library', async () => {
    // Register test library in DB
    repo.upsertLibrary({
      id: 'test-concurrency-lib',
      name: 'Concurrency Test Lib',
      rootPath: 'C:/NonExistent/TestPath',
      sourceType: 'eagle-library',
    })

    // Create a mock cache file in .omnimage/cache so it can seed
    const cacheDir = path.join(testOmnimageDir, 'cache')
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }
    const mockCachePath = path.join(cacheDir, 'index-test-concurrency-lib.json')
    const mockData = [
      {
        id: 'item-conc-1',
        name: 'Item 1',
        ext: 'png',
        width: 800,
        height: 600,
        btime: Date.now(),
        mtime: Date.now(),
      },
      {
        id: 'item-conc-2',
        name: 'Item 2',
        ext: 'jpg',
        width: 1024,
        height: 768,
        btime: Date.now(),
        mtime: Date.now(),
      },
    ]

    fs.writeFileSync(mockCachePath, JSON.stringify(mockData), 'utf-8')

    try {
      // Fire 5 concurrent import calls
      const promises = [
        importer.importLibrary('test-concurrency-lib'),
        importer.importLibrary('test-concurrency-lib'),
        importer.importLibrary('test-concurrency-lib'),
        importer.importLibrary('test-concurrency-lib'),
        importer.importLibrary('test-concurrency-lib'),
      ]

      const results = await Promise.all(promises)

      // All 5 promises should resolve to identical results
      for (const res of results) {
        expect(res.importedCount).toBe(2)
        expect(res.fromCache).toBe(true)
      }

      // Check that the database contains exactly 2 items (not 10!)
      expect(repo.countItems('test-concurrency-lib')).toBe(2)
    } finally {
      if (fs.existsSync(mockCachePath)) {
        try {
          fs.unlinkSync(mockCachePath)
        } catch {
          // ignore
        }
      }
    }
  })
})
