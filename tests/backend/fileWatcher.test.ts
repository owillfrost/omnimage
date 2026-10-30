import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../server/db/migrations'
import {
  normalizePaletteToEagle,
  eaglePaletteToHexStrings,
  LibraryFileWatcher,
} from '../../server/watcher/fileWatcher'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('LibraryFileWatcher Robustness & Palette Parity Tests (Item 7)', () => {
  let db: Database.Database
  let tempDir: string

  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omnimage-watcher-test-'))
  })

  afterEach(() => {
    db.close()
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  })

  it('normalizes hex string palettes and Eagle object palettes without throwing TypeError', () => {
    // 1. Array of Hex strings (from thumbnailGenerator)
    const hexInput = ['#FF0055', '#00AABB', '#123456']
    const fromHex = normalizePaletteToEagle(hexInput, [0.5, 0.3, 0.2])
    expect(fromHex).toHaveLength(3)
    expect(fromHex[0].color).toEqual([255, 0, 85])
    expect(fromHex[0].ratio).toBe(50)

    // 2. Array of Eagle objects (from SQLite row.palette_json on file rename)
    const eagleInput = [
      { color: [255, 0, 85], ratio: 50 },
      { color: [0, 170, 187], ratio: 30 },
    ]
    // Previously: hexInput.replace('#', '') failed with TypeError: hex.replace is not a function
    const fromEagle = normalizePaletteToEagle(eagleInput)
    expect(fromEagle).toHaveLength(2)
    expect(fromEagle[0].color).toEqual([255, 0, 85])
    expect(fromEagle[0].ratio).toBe(50)

    // 3. Round-trip to hex strings
    const hexStrings = eaglePaletteToHexStrings(fromEagle)
    expect(hexStrings).toEqual(['#FF0055', '#00AABB'])

    // 4. Handles empty or corrupted input safely
    const fallback = normalizePaletteToEagle([])
    expect(fallback).toHaveLength(1)
    expect(fallback[0].color).toEqual([24, 24, 27])
  })

  it('cleans up obsolete media files inside .info folder upon file rename', () => {
    const watcher = new LibraryFileWatcher(db)

    // Simulate an .info directory with an existing image file
    const libraryPath = path.join(tempDir, 'test.library')
    const itemId = 'test-rename-item'
    const infoDir = path.join(libraryPath, 'images', `${itemId}.info`)
    fs.mkdirSync(infoDir, { recursive: true })

    const oldMedia = path.join(infoDir, 'old-name.png')
    const thumb = path.join(infoDir, '_thumbnail.webp')
    const meta = path.join(infoDir, 'metadata.json')

    fs.writeFileSync(oldMedia, 'old image bytes')
    fs.writeFileSync(thumb, 'thumbnail bytes')
    fs.writeFileSync(meta, '{}')

    // Simulate rename: new file is added as new-name.png
    const newFileName = 'new-name.png'
    const newMedia = path.join(infoDir, newFileName)
    fs.writeFileSync(newMedia, 'new image bytes')

    // Clean up obsolete files matching the logic in watcher 'add'
    const files = fs.readdirSync(infoDir)
    for (const f of files) {
      const lower = f.toLowerCase()
      if (
        !lower.endsWith('_thumbnail.webp') &&
        !lower.endsWith('_thumbnail.png') &&
        !lower.endsWith('metadata.json') &&
        f !== newFileName
      ) {
        fs.unlinkSync(path.join(infoDir, f))
      }
    }

    const remainingFiles = fs.readdirSync(infoDir)
    expect(remainingFiles).toContain('new-name.png')
    expect(remainingFiles).toContain('_thumbnail.webp')
    expect(remainingFiles).toContain('metadata.json')
    expect(remainingFiles).not.toContain('old-name.png')

    watcher.stopAll()
  })
})
