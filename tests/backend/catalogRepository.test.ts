import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../server/db/migrations'
import { CatalogRepository, invalidateCatalogCache } from '../../server/db/catalogRepository'
import type { CompactCatalogItem } from '../../src/contracts/schemas'

describe('CatalogRepository SQLite & FTS5 Unit Tests', () => {
  let db: Database.Database
  let repo: CatalogRepository

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    runMigrations(db)
    repo = new CatalogRepository(db)
    invalidateCatalogCache()
  })

  afterEach(() => {
    db.close()
  })

  it('correctly registers and lists libraries', () => {
    repo.upsertLibrary({
      id: 'test-lib',
      name: 'Test Library',
      rootPath: 'C:/Test/Path',
      sourceType: 'eagle-library',
      itemCount: 10,
    })

    const libs = repo.listLibraries()
    expect(libs).toHaveLength(1)
    expect(libs[0].id).toBe('test-lib')
    expect(libs[0].name).toBe('Test Library')
    expect(libs[0].itemCount).toBe(10)
  })

  it('inserts items batch in atomic transaction and retrieves compact payload', () => {
    const compactItem1: CompactCatalogItem = {
      id: 'item1',
      name: 'Cyberpunk City Skyline',
      ext: 'png',
      width: 1920,
      height: 1080,
      tags: ['cyberpunk', 'neon', 'city'],
      hasAnnotation: true,
      annotationPreview: 'Futuristic sci-fi cityscape with volumetric fog...',
      palettes: [{ color: [255, 0, 128], ratio: 0.6 }],
    }

    const compactItem2: CompactCatalogItem = {
      id: 'item2',
      name: 'Minimalist Poster Architecture',
      ext: 'jpg',
      width: 1200,
      height: 1800,
      tags: ['minimal', 'poster', 'brutalist'],
      hasAnnotation: false,
    }

    repo.insertItemsBatch('test-lib', [
      {
        id: 'item1',
        name: 'Cyberpunk City Skyline',
        ext: 'png',
        width: 1920,
        height: 1080,
        tagsJson: JSON.stringify(['cyberpunk', 'neon', 'city']),
        annotation: 'Futuristic sci-fi cityscape with volumetric fog, neon signs and cinematic lighting, 8k octane render.',
        compactJson: JSON.stringify(compactItem1),
        mediaRelPath: 'images/item1.info/Cyberpunk City Skyline.png',
      },
      {
        id: 'item2',
        name: 'Minimalist Poster Architecture',
        ext: 'jpg',
        width: 1200,
        height: 1800,
        tagsJson: JSON.stringify(['minimal', 'poster', 'brutalist']),
        compactJson: JSON.stringify(compactItem2),
        mediaRelPath: 'images/item2.info/Minimalist Poster Architecture.jpg',
      },
    ])

    expect(repo.countItems('test-lib')).toBe(2)

    // Retrieve compact payload (pre-serialized buffer)
    const payload = repo.getCompactJsonPayload('test-lib')
    expect(payload.count).toBe(2)
    expect(payload.raw.length).toBeGreaterThan(0)
    expect(payload.gzip.length).toBeGreaterThan(0)

    const parsed = JSON.parse(payload.raw.toString('utf-8'))
    expect(parsed.status).toBe('success')
    expect(parsed.total).toBe(2)
    expect(parsed.data).toHaveLength(2)

    // Compact data does NOT contain full long annotation string
    const item1Parsed = parsed.data.find((d: any) => d.id === 'item1')
    expect(item1Parsed).toBeDefined()
    expect(item1Parsed.annotation).toBeUndefined()
    expect(item1Parsed.hasAnnotation).toBe(true)
    expect(item1Parsed.annotationPreview).toContain('Futuristic sci-fi')
  })

  it('searches prompts, tags, and names via SQLite FTS5 instant matching', () => {
    const itemA: CompactCatalogItem = {
      id: 'itemA',
      name: 'Portrait of an Astronaut',
      ext: 'png',
      tags: ['space', 'cosmos'],
      hasAnnotation: true,
    }
    const itemB: CompactCatalogItem = {
      id: 'itemB',
      name: 'Vintage Car 1968',
      ext: 'jpg',
      tags: ['retro', 'automotive'],
      hasAnnotation: true,
    }

    repo.insertItemsBatch('test-lib', [
      {
        id: 'itemA',
        name: 'Portrait of an Astronaut',
        ext: 'png',
        tagsJson: JSON.stringify(['space', 'cosmos']),
        annotation: 'Cinematic hyperrealistic shot of an astronaut floating in deep cosmos near Saturn rings.',
        compactJson: JSON.stringify(itemA),
        mediaRelPath: 'images/itemA.info/Portrait of an Astronaut.png',
      },
      {
        id: 'itemB',
        name: 'Vintage Car 1968',
        ext: 'jpg',
        tagsJson: JSON.stringify(['retro', 'automotive']),
        annotation: 'Classic muscle car parked in a neon illuminated alley at night.',
        compactJson: JSON.stringify(itemB),
        mediaRelPath: 'images/itemB.info/Vintage Car 1968.jpg',
      },
    ])

    // Search by prompt keyword 'Saturn' (which is NOT in title or tags, ONLY in annotation!)
    const searchSaturn = repo.searchItemsFts('test-lib', 'Saturn')
    expect(searchSaturn.count).toBe(1)
    const saturnData = JSON.parse(searchSaturn.raw.toString('utf-8'))
    expect(saturnData.data[0].id).toBe('itemA')

    // Search by tag 'retro'
    const searchRetro = repo.searchItemsFts('test-lib', 'retro')
    expect(searchRetro.count).toBe(1)
    const retroData = JSON.parse(searchRetro.raw.toString('utf-8'))
    expect(retroData.data[0].id).toBe('itemB')

    // Search by prefix 'astro'
    const searchAstro = repo.searchItemsFts('test-lib', 'astro')
    expect(searchAstro.count).toBe(1)
    const astroData = JSON.parse(searchAstro.raw.toString('utf-8'))
    expect(astroData.data[0].id).toBe('itemA')

    // Search for non-existent keyword
    const searchEmpty = repo.searchItemsFts('test-lib', 'dinosaur')
    expect(searchEmpty.count).toBe(0)
  })

  it('fetches full detail including long annotation on demand', () => {
    const compact: CompactCatalogItem = {
      id: 'detail-item',
      name: 'Detail Test Art',
      ext: 'webp',
      hasAnnotation: true,
    }

    const fullPrompt = 'A highly detailed surrealistic painting of clockwork gears floating in an ocean of liquid mercury.'

    repo.insertItemsBatch('test-lib', [
      {
        id: 'detail-item',
        name: 'Detail Test Art',
        ext: 'webp',
        annotation: fullPrompt,
        compactJson: JSON.stringify(compact),
        mediaRelPath: 'images/detail-item.info/Detail Test Art.webp',
      },
    ])

    const detail = repo.getItemDetail('test-lib', 'detail-item')
    expect(detail).not.toBeNull()
    expect(detail?.id).toBe('detail-item')
    expect(detail?.annotation).toBe(fullPrompt)
    expect(detail?.filePath).toBe('images/detail-item.info/Detail Test Art.webp')
  })

  it('updates item metadata patch and synchronizes FTS5 index', () => {
    const compact: CompactCatalogItem = {
      id: 'patch-item',
      name: 'Original Title',
      ext: 'png',
      tags: ['original-tag'],
      hasAnnotation: false,
    }

    repo.insertItemsBatch('test-lib', [
      {
        id: 'patch-item',
        name: 'Original Title',
        ext: 'png',
        tagsJson: JSON.stringify(['original-tag']),
        compactJson: JSON.stringify(compact),
        mediaRelPath: 'images/patch-item.info/Original Title.png',
      },
    ])

    // Update metadata
    const updated = repo.updateItemMetadata('test-lib', 'patch-item', {
      name: 'Updated Quantum Landscape',
      tags: ['quantum', 'landscape'],
      annotation: 'Added detailed prompt about quantum interference patterns.',
    })
    expect(updated).toBe(true)

    // Verify detail reflects patch
    const detail = repo.getItemDetail('test-lib', 'patch-item')
    expect(detail?.name).toBe('Updated Quantum Landscape')
    expect(detail?.tags).toEqual(['quantum', 'landscape'])
    expect(detail?.annotation).toBe('Added detailed prompt about quantum interference patterns.')

    // Verify FTS5 now finds 'quantum'
    const searchQuantum = repo.searchItemsFts('test-lib', 'quantum')
    expect(searchQuantum.count).toBe(1)
  })

  it('toggles library hidden status and deletes library cascade', () => {
    repo.upsertLibrary({
      id: 'custom-lib',
      name: 'Custom.library',
      rootPath: 'C:/Test/Custom.library',
      sourceFolderPath: 'C:/Test/SourceFolder',
      sourceType: 'eagle-library',
      itemCount: 1,
      hidden: false,
    })

    const compact: CompactCatalogItem = {
      id: 'c1',
      name: 'Sample Item',
      ext: 'png',
    }
    repo.insertItemsBatch('custom-lib', [
      {
        id: 'c1',
        name: 'Sample Item',
        ext: 'png',
        annotation: 'Test cascade removal prompt',
        compactJson: JSON.stringify(compact),
        mediaRelPath: 'images/c1.info/Sample Item.png',
      },
    ])

    // Hide library
    expect(repo.setLibraryHidden('custom-lib', true)).toBe(true)
    expect(repo.getLibrary('custom-lib')?.hidden).toBe(true)

    // Unhide library
    expect(repo.setLibraryHidden('custom-lib', false)).toBe(true)
    expect(repo.getLibrary('custom-lib')?.hidden).toBe(false)

    // Cascade delete library
    expect(repo.deleteLibraryCascade('custom-lib')).toBe(true)
    expect(repo.getLibrary('custom-lib')).toBeNull()
    expect(repo.countItems('custom-lib')).toBe(0)
    expect(repo.searchItemsFts('custom-lib', 'cascade').count).toBe(0)
  })
})
