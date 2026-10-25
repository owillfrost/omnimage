import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { computeFileContentHash, generateItemId } from '../../server/media/contentHasher'

describe('ContentHasher 3-Point Fast Hashing Tests', () => {
  const testDir = path.resolve(process.cwd(), '.tmp-hasher-tests')

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true })
    }
  })

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('generates IDs matching the safe format /^[A-Za-z0-9_-]{8,32}$/', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const id = generateItemId()
      expect(id).toMatch(/^[A-Za-z0-9_-]{8,32}$/)
      expect(id).toHaveLength(16)
      expect(ids.has(id)).toBe(false)
      ids.add(id)
    }
  })

  it('hashes small files (<= 192 KB) using complete SHA-256', async () => {
    const smallFile = path.join(testDir, 'small.txt')
    const content = Buffer.from('Omnimage Visual Cataloging - Small File Verification Test')
    fs.writeFileSync(smallFile, content)

    const expectedHash = crypto.createHash('sha256').update(content).digest('hex')
    const computedHash = await computeFileContentHash(smallFile, content.length)

    expect(computedHash).toBe(expectedHash)
  })

  it('hashes large files (> 192 KB) using 3-point sampling deterministically', async () => {
    const largeFile = path.join(testDir, 'large.bin')
    const size = 500 * 1024 // 500 KB > 192 KB
    const buffer = Buffer.alloc(size)

    // Seed deterministic pattern
    for (let i = 0; i < size; i += 1024) {
      buffer.writeUInt32LE((i * 1337) >>> 0, i)
    }

    fs.writeFileSync(largeFile, buffer)

    const hash1 = await computeFileContentHash(largeFile)
    const hash2 = await computeFileContentHash(largeFile, size)

    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(64)

    // Moving/renaming the file must produce identical contentHash
    const movedFile = path.join(testDir, 'large_renamed.bin')
    fs.copyFileSync(largeFile, movedFile)
    const hashMoved = await computeFileContentHash(movedFile)
    expect(hashMoved).toBe(hash1)
  })

  it('detects byte changes at start, middle, and end of large files', async () => {
    const size = 300 * 1024 // 300 KB
    const baseBuf = Buffer.alloc(size, 0x41) // All 'A'
    const baseFile = path.join(testDir, 'base.bin')
    fs.writeFileSync(baseFile, baseBuf)
    const baseHash = await computeFileContentHash(baseFile)

    // 1. Modify start byte
    const startModBuf = Buffer.from(baseBuf)
    startModBuf[10] = 0x5a
    const startModFile = path.join(testDir, 'start_mod.bin')
    fs.writeFileSync(startModFile, startModBuf)
    const startHash = await computeFileContentHash(startModFile)
    expect(startHash).not.toBe(baseHash)

    // 2. Modify middle byte
    const midModBuf = Buffer.from(baseBuf)
    midModBuf[Math.floor(size / 2)] = 0x5a
    const midModFile = path.join(testDir, 'mid_mod.bin')
    fs.writeFileSync(midModFile, midModBuf)
    const midHash = await computeFileContentHash(midModFile)
    expect(midHash).not.toBe(baseHash)

    // 3. Modify end byte
    const endModBuf = Buffer.from(baseBuf)
    endModBuf[size - 100] = 0x5a
    const endModFile = path.join(testDir, 'end_mod.bin')
    fs.writeFileSync(endModFile, endModBuf)
    const endHash = await computeFileContentHash(endModFile)
    expect(endHash).not.toBe(baseHash)
  })
})
