import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { SidecarManager, type ItemSidecarMetadata } from '../../server/sidecar/sidecarManager'
import { runMigrations } from '../../server/db/migrations'
import { CatalogRepository } from '../../server/db/catalogRepository'

describe('SidecarManager & Rebuild SQLite Tests', () => {
  const testLibDir = path.resolve(process.cwd(), '.tmp-sidecar-tests')
  let sidecarMgr: SidecarManager
  let db: Database.Database

  beforeEach(() => {
    if (!fs.existsSync(testLibDir)) {
      fs.mkdirSync(testLibDir, { recursive: true })
    }
    sidecarMgr = new SidecarManager(testLibDir)
    db = new Database(':memory:')
    runMigrations(db)
  })

  afterEach(() => {
    db.close()
    if (fs.existsSync(testLibDir)) {
      fs.rmSync(testLibDir, { recursive: true, force: true })
    }
  })

  it('saves and reads item sidecar atomically with two-character sharding', () => {
    const item: ItemSidecarMetadata = {
      id: '01ABCDEF12345678',
      name: 'Cyberpunk Drone Concept',
      ext: 'png',
      width: 1920,
      height: 1080,
      dominantColor: '#FF0055',
      palette: ['#FF0055', '#112233'],
      paletteWeights: [0.7, 0.3],
      tags: ['cyberpunk', 'drone'],
      annotation: 'High tech autonomous quadcopter patrolling neo tokyo streets',
      relativePath: 'assets/drone.png',
    }

    const savedPath = sidecarMgr.saveItemSidecar(item)
    expect(fs.existsSync(savedPath)).toBe(true)

    // Check sharding: ID starts with '01', so path must contain items/01/01ABCDEF12345678.json
    expect(savedPath.replace(/\\/g, '/')).toContain('/items/01/01ABCDEF12345678.json')

    const read = sidecarMgr.readItemSidecar('01ABCDEF12345678')
    expect(read).not.toBeNull()
    expect(read?.name).toBe('Cyberpunk Drone Concept')
    expect(read?.annotation).toContain('neo tokyo')
    expect(read?.palette).toEqual(['#FF0055', '#112233'])
  })

  it('saves and reads library level taxonomy sidecar (.omnimage/library.json)', () => {
    sidecarMgr.saveLibrarySidecar({
      library: 'my-collection',
      folders: [
        {
          id: 'f1',
          name: 'Concept Art',
          allFolderIds: ['f1'],
          itemCount: 1,
          directCount: 1,
          children: [],
        },
      ],
      tagsGroups: [
        {
          id: 'tg1',
          name: 'Themes',
          tags: ['cyberpunk', 'sci-fi'],
        },
      ],
    })

    const libSidecar = sidecarMgr.readLibrarySidecar()
    expect(libSidecar).not.toBeNull()
    expect(libSidecar?.library).toBe('my-collection')
    expect(libSidecar?.folders).toHaveLength(1)
    expect(libSidecar?.folders[0].name).toBe('Concept Art')
    expect(libSidecar?.tagsGroups).toHaveLength(1)
  })

  it('rebuilds entire SQLite database from sidecars without any data loss', async () => {
    // 1. Create multiple item sidecars across different shards
    const items: ItemSidecarMetadata[] = [
      {
        id: 'AA11223344556677',
        name: 'Alpha Concept Architecture',
        ext: 'jpg',
        width: 1000,
        height: 1000,
        tags: ['architecture', 'minimal'],
        annotation: 'Brutalist concrete museum building at twilight',
        relativePath: 'architecture/alpha.jpg',
      },
      {
        id: 'BB99887766554433',
        name: 'Beta Isometric Vehicle',
        ext: 'png',
        width: 1280,
        height: 720,
        tags: ['vehicle', 'isometric'],
        annotation: 'Futuristic electric rover exploration vehicle',
        relativePath: 'vehicles/beta.png',
      },
      {
        id: 'CC00112233445566',
        name: 'Gamma Abstract Fluid',
        ext: 'webp',
        width: 800,
        height: 1200,
        tags: ['fluid', 'gradient'],
        annotation: 'Vibrant iridescent swirling liquid simulation',
        relativePath: 'abstract/gamma.webp',
      },
    ]

    for (const it of items) {
      sidecarMgr.saveItemSidecar(it)
    }

    // 2. Rebuild database from sidecars
    const rebuildResult = await sidecarMgr.rebuildSqliteFromSidecars('test-lib', db)
    expect(rebuildResult.count).toBe(3)

    // 3. Verify SQLite items table and FTS5 search
    const repo = new CatalogRepository(db)
    expect(repo.countItems('test-lib')).toBe(3)

    // Verify detail retrieval on demand
    const alphaDetail = repo.getItemDetail('test-lib', 'AA11223344556677')
    expect(alphaDetail).not.toBeNull()
    expect(alphaDetail?.name).toBe('Alpha Concept Architecture')
    expect(alphaDetail?.annotation).toContain('Brutalist concrete')

    // Verify FTS5 instant matching works on rebuilt items
    const searchRover = repo.searchItemsFts('test-lib', 'rover')
    expect(searchRover.count).toBe(1)
    const roverData = JSON.parse(searchRover.raw.toString('utf-8'))
    expect(roverData.data[0].id).toBe('BB99887766554433')

    const searchFluid = repo.searchItemsFts('test-lib', 'iridescent')
    expect(searchFluid.count).toBe(1)
    const fluidData = JSON.parse(searchFluid.raw.toString('utf-8'))
    expect(fluidData.data[0].id).toBe('CC00112233445566')
  })
})
