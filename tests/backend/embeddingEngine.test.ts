import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  getEmbeddingConfig,
  saveEmbeddingConfig,
} from '../../server/config/embeddingConfig'
import { getEmbeddingEngine } from '../../server/clip/engines/engineRegistry'
import { resolveEmbeddingsFilePath, resolveBestEmbeddingsEngine } from '../../server/clip/clipQueryService'
import { backgroundIndexer, buildItemDocument } from '../../server/clip/backgroundIndexer'
import { processMatryoshka512 } from '../../server/clip/engines/gemma2Engine'
import { computeQuantizedCosine } from '../../src/core/vectorQuantization'

describe('Embedding Engine Architecture (Phase 1)', () => {
  const settingsPath = path.resolve(process.cwd(), '.omnimage/settings.json')
  let originalSettingsContent: string | null = null

  beforeEach(() => {
    delete process.env.OMNIMAGE_EMBEDDING_ENGINE
    delete process.env.OMNIMAGE_DEVICE
    if (fs.existsSync(settingsPath)) {
      originalSettingsContent = fs.readFileSync(settingsPath, 'utf-8')
      fs.unlinkSync(settingsPath)
    } else {
      originalSettingsContent = null
    }
  })

  afterEach(() => {
    delete process.env.OMNIMAGE_EMBEDDING_ENGINE
    delete process.env.OMNIMAGE_DEVICE
    if (originalSettingsContent !== null) {
      fs.writeFileSync(settingsPath, originalSettingsContent, 'utf-8')
    } else if (fs.existsSync(settingsPath)) {
      fs.unlinkSync(settingsPath)
    }
  })

  it('defaults to clip-vit-b32 without breaking existing configuration', () => {
    const config = getEmbeddingConfig()
    expect(config.engine).toBe('clip-vit-b32')
    expect(config.device).toBe('auto')
  })

  it('respects OMNIMAGE_EMBEDDING_ENGINE environment override', () => {
    process.env.OMNIMAGE_EMBEDDING_ENGINE = 'embeddinggemma-2'
    process.env.OMNIMAGE_DEVICE = 'directml'

    const config = getEmbeddingConfig()
    expect(config.engine).toBe('embeddinggemma-2')
    expect(config.device).toBe('directml')
  })

  it('persists and reads engine preference from .omnimage/settings.json', () => {
    saveEmbeddingConfig({ engine: 'embeddinggemma-2', device: 'directml' })
    const reloaded = getEmbeddingConfig()
    expect(reloaded.engine).toBe('embeddinggemma-2')
    expect(reloaded.device).toBe('directml')

    saveEmbeddingConfig({ engine: 'clip-vit-b32' })
    const restored = getEmbeddingConfig()
    expect(restored.engine).toBe('clip-vit-b32')
  })

  it('loads ClipVitB32Engine as default singleton', async () => {
    const engine = await getEmbeddingEngine()
    expect(engine.id).toBe('clip-vit-b32')
    expect(engine.dim).toBe(512)
    expect(typeof engine.computeTextEmbedding).toBe('function')
    expect(typeof engine.computeVisualEmbedding).toBe('function')
  })

  it('resolves correct embeddings file paths according to engine to avoid mixing vectors', () => {
    const clipPath = resolveEmbeddingsFilePath('my-lib', 'clip-vit-b32')
    // No existing file returns null
    expect(clipPath).toBeNull()

    // Test file name calculation when file is present
    const testDir = path.resolve(process.cwd(), '.omnimage/embeddings')
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true })

    const clipFake = path.join(testDir, 'embeddings-test-phase1.bin')
    const gemmaFake = path.join(testDir, 'embeddings-test-phase1.gemma2.bin')

    fs.writeFileSync(clipFake, Buffer.alloc(512))
    fs.writeFileSync(gemmaFake, Buffer.alloc(512))

    try {
      const resolvedClip = resolveEmbeddingsFilePath('test-phase1', 'clip-vit-b32')
      const resolvedGemma = resolveEmbeddingsFilePath('test-phase1', 'embeddinggemma-2')

      expect(resolvedClip).toBe(clipFake)
      expect(resolvedGemma).toBe(gemmaFake)
    } finally {
      if (fs.existsSync(clipFake)) fs.unlinkSync(clipFake)
      if (fs.existsSync(gemmaFake)) fs.unlinkSync(gemmaFake)
    }
  })

  it('updates background indexer status with selected engine metadata', () => {
    const status = backgroundIndexer.getStatus()
    expect(status.state).toBe('idle')
    expect(status.engine).toBeDefined()
  })

  it('correctly processes 768d raw vectors into normalized 512d Int8 via Matryoshka', () => {
    // Generate synthetic 768-dimensional float vector
    const raw768 = new Float32Array(768)
    for (let i = 0; i < 768; i++) {
      raw768[i] = Math.sin(i * 0.1) * (i % 2 === 0 ? 1 : -1)
    }

    const quantized = processMatryoshka512(raw768)
    expect(quantized).toBeInstanceOf(Int8Array)
    expect(quantized.length).toBe(512)

    // Verify non-zero and values bounded in [-127, 127]
    let nonZero = 0
    for (let i = 0; i < 512; i++) {
      expect(quantized[i]).toBeGreaterThanOrEqual(-127)
      expect(quantized[i]).toBeLessThanOrEqual(127)
      if (quantized[i] !== 0) nonZero++
    }
    expect(nonZero).toBeGreaterThan(400)

    // Verify compatibility with computeQuantizedCosine
    const matrix = new Int8Array(512 * 2)
    matrix.set(quantized, 0)
    matrix.set(quantized, 512)
    const selfSim = computeQuantizedCosine(matrix, 512, 0, 1)
    expect(selfSim).toBeCloseTo(1.0, 2)
  })

  it('loads Gemma2Engine dynamically only when requested', async () => {
    const gemmaEngine = await getEmbeddingEngine('embeddinggemma-2')
    expect(gemmaEngine.id).toBe('embeddinggemma-2')
    expect(gemmaEngine.dim).toBe(512)
    expect(gemmaEngine.modality).toBe('text')
    await expect(gemmaEngine.computeVisualEmbedding(Buffer.from('fake'))).rejects.toThrow(
      /text embedding model/
    )
  })

  it('buildItemDocument correctly formats title, tags and prompt annotations', () => {
    const doc = buildItemDocument({
      name: 'Cyberpunk Cityscape',
      tagsJson: JSON.stringify(['sci-fi', 'neon', 'night']),
      annotation: 'photorealistic 8k render, glowing neon signs, rain on asphalt',
    })
    expect(doc).toContain('title: Cyberpunk Cityscape')
    expect(doc).toContain('tags: sci-fi, neon, night')
    expect(doc).toContain('prompt: photorealistic 8k render')
  })

  it('resolveBestEmbeddingsEngine falls back to available index when requested engine is missing', () => {
    const testDir = path.resolve(process.cwd(), '.omnimage/embeddings')
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true })

    const clipFake = path.join(testDir, 'embeddings-test-fallback-lib.bin')
    fs.writeFileSync(clipFake, Buffer.alloc(512))

    try {
      // Requested gemma, but only clip exists -> must fallback to clip
      const resolved = resolveBestEmbeddingsEngine('test-fallback-lib', 'embeddinggemma-2')
      expect(resolved.engine).toBe('clip-vit-b32')
      expect(resolved.isFallback).toBe(true)
      expect(resolved.filePath).toBe(clipFake)
    } finally {
      if (fs.existsSync(clipFake)) fs.unlinkSync(clipFake)
    }
  })
})
