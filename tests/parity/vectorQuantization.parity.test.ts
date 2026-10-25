import { describe, it, expect } from 'vitest'
import {
  quantizeNormalizedFloat32ToInt8,
  computeQuantizedCosine,
  computeQuantizedCosineWithQuery,
} from '../../src/core/vectorQuantization'
import {
  serializeEmbeddingsBinary,
  parseEmbeddingsBinary,
} from '../../src/contracts/binaryFormats'

describe('Vector Quantization & Binary Formats Parity Tests', () => {
  it('quantizeNormalizedFloat32ToInt8 accurately quantizes float vectors to Int8 [-127..127]', () => {
    const rawFloats = new Float32Array(512)
    rawFloats[0] = 1.0 // Single active dimension

    const quantized = quantizeNormalizedFloat32ToInt8(rawFloats, 512)
    expect(quantized.length).toBe(512)
    expect(quantized[0]).toBe(127)
    expect(quantized[1]).toBe(0)

    // Test with mixed positive and negative values
    const mixedFloats = new Float32Array(512)
    mixedFloats[0] = 0.5
    mixedFloats[1] = -0.5

    const mixedQuant = quantizeNormalizedFloat32ToInt8(mixedFloats, 512)
    expect(mixedQuant[0]).toBeGreaterThan(80)
    expect(mixedQuant[1]).toBeLessThan(-80)
    expect(Math.abs(mixedQuant[0] + mixedQuant[1])).toBeLessThanOrEqual(1)

    // Ensure all values are strictly within [-127, 127]
    for (let i = 0; i < 512; i++) {
      expect(mixedQuant[i]).toBeGreaterThanOrEqual(-127)
      expect(mixedQuant[i]).toBeLessThanOrEqual(127)
    }
  })

  it('computeQuantizedCosine produces exact cosine similarities', () => {
    const dim = 512
    const matrix = new Int8Array(dim * 3)

    // Vector 0: pointing along dim 0
    matrix[0] = 127
    // Vector 1: identical to Vector 0
    matrix[dim] = 127
    // Vector 2: orthogonal, pointing along dim 1
    matrix[dim * 2 + 1] = 127

    // Same vectors -> cosine = 1.0
    const cosIdentical = computeQuantizedCosine(matrix, dim, 0, 1)
    expect(cosIdentical).toBeCloseTo(1.0, 4)

    // Orthogonal vectors -> cosine = 0.0
    const cosOrtho = computeQuantizedCosine(matrix, dim, 0, 2)
    expect(cosOrtho).toBeCloseTo(0.0, 4)
  })

  it('computeQuantizedCosineWithQuery evaluates arbitrary query against matrix row', () => {
    const dim = 512
    const targetMatrix = new Int8Array(dim * 2)
    targetMatrix[0] = 127
    targetMatrix[dim + 1] = 127

    const queryVec = new Int8Array(dim)
    queryVec[0] = 127

    const simMatch = computeQuantizedCosineWithQuery(queryVec, targetMatrix, dim, 0)
    expect(simMatch).toBeCloseTo(1.0, 4)

    const simMismatch = computeQuantizedCosineWithQuery(queryVec, targetMatrix, dim, 1)
    expect(simMismatch).toBeCloseTo(0.0, 4)
  })

  it('serializeEmbeddingsBinary and parseEmbeddingsBinary round-trip without loss', () => {
    const ids = ['item-001', 'item-002', 'item-003']
    const dim = 512
    const originalVectors = new Int8Array(ids.length * dim)

    // Fill with sample deterministic values
    for (let i = 0; i < originalVectors.length; i++) {
      originalVectors[i] = ((i * 17) % 255) - 127
    }

    const binaryBuffer = serializeEmbeddingsBinary(ids, originalVectors, dim)
    expect(binaryBuffer.byteLength).toBeGreaterThan(ids.length * dim)

    const parsed = parseEmbeddingsBinary(binaryBuffer)
    expect(parsed.ids).toEqual(ids)
    expect(parsed.dim).toBe(dim)
    expect(parsed.vectors.length).toBe(originalVectors.length)

    // Verify all Int8 values match 1:1
    for (let i = 0; i < originalVectors.length; i++) {
      expect(parsed.vectors[i]).toBe(originalVectors[i])
    }
  })
})
