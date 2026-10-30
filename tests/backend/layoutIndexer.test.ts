import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import Database from 'better-sqlite3'
import sharp from 'sharp'
import { runMigrations } from '../../server/db/migrations'
import { CatalogRepository } from '../../server/db/catalogRepository'
import {
  LayoutIndexer,
  resolveLayoutFilePath,
  handleLayoutBinaryStream,
  invalidateLayoutCache,
} from '../../server/layout/layoutIndexer'
import { parseLayoutBinary } from '../../src/contracts/binaryFormats'

describe('LayoutIndexer & Binary Streaming Backend Tests', () => {
  let db: Database.Database
  let repo: CatalogRepository
  let testDir: string
  let testBinPath: string

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
    repo = new CatalogRepository(db)

    testDir = path.resolve('.omnimage/test-layout-media')
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true })
    }

    testBinPath = resolveLayoutFilePath('test-layout-lib')
    if (fs.existsSync(testBinPath)) {
      fs.unlinkSync(testBinPath)
    }
    invalidateLayoutCache('test-layout-lib')
  })

  afterEach(() => {
    db.close()
    if (fs.existsSync(testBinPath)) {
      try { fs.unlinkSync(testBinPath) } catch {}
    }
    if (fs.existsSync(testDir)) {
      try { fs.rmSync(testDir, { recursive: true, force: true }) } catch {}
    }
    invalidateLayoutCache('test-layout-lib')
  })

  it('indexes layout vectors for library items and produces valid layout binary', async () => {
    // 1. Create 2 test thumbnails
    const thumb1Path = path.join(testDir, 'thumb1.webp')
    const thumb2Path = path.join(testDir, 'thumb2.webp')

    await sharp({
      create: {
        width: 128,
        height: 72,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .webp()
      .toFile(thumb1Path)

    await sharp({
      create: {
        width: 128,
        height: 72,
        channels: 4,
        background: { r: 10, g: 10, b: 10, alpha: 1 },
      },
    })
      .webp()
      .toFile(thumb2Path)

    // 2. Register items in SQLite
    repo.insertItemsBatch('test-layout-lib', [
      {
        id: 'item-layout-1',
        name: 'Item 1',
        ext: 'webp',
        compactJson: JSON.stringify({ id: 'item-layout-1', name: 'Item 1', ext: 'webp' }),
        mediaRelPath: 'thumb1.webp',
        thumbRelPath: path.relative(process.cwd(), thumb1Path),
      },
      {
        id: 'item-layout-2',
        name: 'Item 2',
        ext: 'webp',
        compactJson: JSON.stringify({ id: 'item-layout-2', name: 'Item 2', ext: 'webp' }),
        mediaRelPath: 'thumb2.webp',
        thumbRelPath: path.relative(process.cwd(), thumb2Path),
      },
    ])

    // 3. Run layout indexer
    const indexer = new LayoutIndexer()
    const result = await indexer.startIndexing('test-layout-lib', db, { batchYield: 1 })

    expect(result.total).toBe(2)
    expect(result.newlyIndexed).toBe(2)
    expect(fs.existsSync(testBinPath)).toBe(true)

    // 4. Verify binary format
    const raw = fs.readFileSync(testBinPath)
    const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
    const parsed = parseLayoutBinary(ab)

    expect(parsed.ids).toEqual(['item-layout-1', 'item-layout-2'])
    expect(parsed.dim).toBe(288)
    expect(parsed.vectors.length).toBe(2 * 288)
  })

  it('streams layout binary with ETag and gzip headers', async () => {
    // Write synthetic binary package
    const ab = new ArrayBuffer(4 + 16 + 288)
    const view = new DataView(ab)
    const ids = JSON.stringify(['id1'])
    const enc = new TextEncoder().encode(ids)
    view.setUint32(0, enc.byteLength, true)
    new Uint8Array(ab, 4, enc.byteLength).set(enc)
    fs.writeFileSync(testBinPath, Buffer.from(ab))

    // Mock HTTP request / response
    const req = {
      headers: { 'accept-encoding': 'gzip' },
    } as any

    const writtenChunks: Buffer[] = []
    const headers: Record<string, string> = {}

    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      setHeader(k: string, v: string) {
        headers[k] = v
      },
      end(chunk?: Buffer) {
        if (chunk) writtenChunks.push(chunk)
      },
    }) as any

    await handleLayoutBinaryStream(req, res, 'test-layout-lib')

    expect(headers['X-Layout-Dim']).toBe('288')
    expect(headers['Content-Encoding']).toBe('gzip')
    expect(writtenChunks.length).toBeGreaterThan(0)
  })
})
