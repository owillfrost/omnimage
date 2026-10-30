/**
 * Binary Formats: Parsers and Serializers
 * 
 * Provides zero-copy parsing and serialization for:
 * 1. embeddings.bin (CLIP ViT-B/32 Int8 quantized vectors)
 * 2. colors.bin (Perceptual CIELAB/HSL color vectors)
 */

export interface ParsedEmbeddingsBinary {
  ids: string[]
  vectors: Int8Array
  dim: number
}

/**
 * Serializes an array of item IDs and contiguous Int8 embedding vectors into a binary buffer.
 * Format:
 * - Bytes [0..3]: Uint32LE indicating header size H
 * - Bytes [4..4+H]: UTF-8 JSON string array of IDs
 * - Bytes [4+H..end]: Contiguous Int8Array of dimension `dim` per item
 */
export function serializeEmbeddingsBinary(
  ids: string[],
  vectors: Int8Array,
  _dim = 512
): ArrayBuffer {
  const headerJson = JSON.stringify(ids)
  const encoder = new TextEncoder()
  const headerBytes = encoder.encode(headerJson)
  const headerLen = headerBytes.byteLength

  const totalBytes = 4 + headerLen + vectors.byteLength
  const buffer = new ArrayBuffer(totalBytes)
  const dataView = new DataView(buffer)

  // Write header length Uint32LE
  dataView.setUint32(0, headerLen, true)

  // Write header JSON bytes
  const uint8View = new Uint8Array(buffer)
  uint8View.set(headerBytes, 4)

  // Write contiguous Int8 vectors
  const vectorTarget = new Int8Array(buffer, 4 + headerLen, vectors.length)
  vectorTarget.set(vectors)

  return buffer
}

/**
 * Parses an embeddings binary buffer with zero copies where possible.
 */
export function parseEmbeddingsBinary(buffer: ArrayBuffer): ParsedEmbeddingsBinary {
  if (buffer.byteLength < 4) {
    throw new Error('Embeddings buffer is too small (under 4 bytes)')
  }

  const dataView = new DataView(buffer)
  const headerLen = dataView.getUint32(0, true)

  if (4 + headerLen > buffer.byteLength) {
    throw new Error(`Invalid header length: ${headerLen} exceeds buffer size ${buffer.byteLength}`)
  }

  const headerBytes = new Uint8Array(buffer, 4, headerLen)
  const decoder = new TextDecoder('utf-8')
  const headerJson = decoder.decode(headerBytes)
  const ids: string[] = JSON.parse(headerJson)

  const vectorOffset = 4 + headerLen
  const vectorBytes = buffer.byteLength - vectorOffset
  const count = ids.length
  const dim = count > 0 ? Math.floor(vectorBytes / count) : 512

  const vectors = new Int8Array(buffer, vectorOffset, count * dim)

  return {
    ids,
    vectors,
    dim,
  }
}

export interface ParsedColorsBinary {
  ids: string[]
  colorVectors: Float32Array
  floatsPerItem: number
}

/**
 * Serializes item color vectors (5 floats [L, a, b, h, s] per palette entry) into a binary package.
 */
export function serializeColorsBinary(
  ids: string[],
  colorVectors: Float32Array,
  _floatsPerItem = 30
): ArrayBuffer {
  const headerJson = JSON.stringify(ids)
  const encoder = new TextEncoder()
  const headerBytes = encoder.encode(headerJson)
  const headerLen = headerBytes.byteLength

  const totalBytes = 4 + headerLen + colorVectors.byteLength
  const buffer = new ArrayBuffer(totalBytes)
  const dataView = new DataView(buffer)

  dataView.setUint32(0, headerLen, true)
  const uint8View = new Uint8Array(buffer)
  uint8View.set(headerBytes, 4)

  const floatTarget = new Float32Array(buffer, 4 + headerLen, colorVectors.length)
  floatTarget.set(colorVectors)

  return buffer
}

/**
 * Parses a colors binary package.
 */
export function parseColorsBinary(buffer: ArrayBuffer): ParsedColorsBinary {
  if (buffer.byteLength < 4) {
    throw new Error('Colors buffer is too small (under 4 bytes)')
  }

  const dataView = new DataView(buffer)
  const headerLen = dataView.getUint32(0, true)
  const headerBytes = new Uint8Array(buffer, 4, headerLen)
  const decoder = new TextDecoder('utf-8')
  const ids: string[] = JSON.parse(decoder.decode(headerBytes))

  const floatOffset = 4 + headerLen
  const floatBytes = buffer.byteLength - floatOffset
  const totalFloats = Math.floor(floatBytes / 4)
  const count = ids.length
  const floatsPerItem = count > 0 ? Math.floor(totalFloats / count) : 30

  const colorVectors = new Float32Array(buffer, floatOffset, count * floatsPerItem)

  return {
    ids,
    colorVectors,
    floatsPerItem,
  }
}

export interface LayoutBinaryHeader {
  version: number
  dim: number
  ids: string[]
  extractorVersion?: number
}

export interface ParsedLayoutBinary {
  ids: string[]
  vectors: Uint8Array
  dim: number
  version: number
  extractorVersion: number
}

/**
 * Serializes item layout vectors into a versioned binary package.
 * Format:
 * - Bytes [0..3]: Uint32LE indicating header size H
 * - Bytes [4..4+H]: UTF-8 JSON { version, dim, ids, extractorVersion } (or legacy string array in v1)
 * - Bytes [4+H..end]: Contiguous Uint8Array of dimension `dim` per item
 */
export function serializeLayoutBinary(
  ids: string[],
  vectors: Uint8Array,
  dim = 288,
  version = 2,
  extractorVersion = 1
): ArrayBuffer {
  const headerData: LayoutBinaryHeader = {
    version,
    dim,
    ids,
    extractorVersion,
  }
  const headerJson = JSON.stringify(headerData)
  const encoder = new TextEncoder()
  const headerBytes = encoder.encode(headerJson)
  const headerLen = headerBytes.byteLength

  const totalBytes = 4 + headerLen + vectors.byteLength
  const buffer = new ArrayBuffer(totalBytes)
  const dataView = new DataView(buffer)

  dataView.setUint32(0, headerLen, true)
  const uint8View = new Uint8Array(buffer)
  uint8View.set(headerBytes, 4)

  const vectorTarget = new Uint8Array(buffer, 4 + headerLen, vectors.length)
  vectorTarget.set(vectors)

  return buffer
}

/**
 * Parses a layout binary package with zero copies where possible.
 * Fully backwards-compatible with legacy unversioned v1 arrays and unversioned extractor headers.
 */
export function parseLayoutBinary(buffer: ArrayBuffer): ParsedLayoutBinary {
  if (buffer.byteLength < 4) {
    throw new Error('Layout buffer is too small (under 4 bytes)')
  }

  const dataView = new DataView(buffer)
  const headerLen = dataView.getUint32(0, true)

  if (4 + headerLen > buffer.byteLength) {
    throw new Error(`Invalid header length: ${headerLen} exceeds buffer size ${buffer.byteLength}`)
  }

  const headerBytes = new Uint8Array(buffer, 4, headerLen)
  const decoder = new TextDecoder('utf-8')
  const rawHeader = JSON.parse(decoder.decode(headerBytes))

  let ids: string[] = []
  let version = 1
  let extractorVersion = 1
  let parsedDim: number | undefined

  if (Array.isArray(rawHeader)) {
    // Legacy v1 format: raw JSON array of IDs
    ids = rawHeader
    version = 1
    extractorVersion = 1
  } else if (rawHeader && typeof rawHeader === 'object') {
    // Versioned v2+ format: { version, dim, ids, extractorVersion }
    ids = Array.isArray(rawHeader.ids) ? rawHeader.ids : []
    version = typeof rawHeader.version === 'number' ? rawHeader.version : 2
    parsedDim = typeof rawHeader.dim === 'number' ? rawHeader.dim : undefined
    extractorVersion = typeof rawHeader.extractorVersion === 'number' ? rawHeader.extractorVersion : 1
  }

  const vectorOffset = 4 + headerLen
  const vectorBytes = buffer.byteLength - vectorOffset
  const count = ids.length
  const dim = parsedDim || (count > 0 ? Math.floor(vectorBytes / count) : 288)

  const vectors = new Uint8Array(buffer, vectorOffset, count * dim)

  return {
    ids,
    vectors,
    dim,
    version,
    extractorVersion,
  }
}

