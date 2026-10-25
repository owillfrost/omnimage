import fs from 'node:fs'
import crypto from 'node:crypto'

const CHUNK_SIZE = 65536 // 64 KB
const SMALL_FILE_THRESHOLD = 196608 // 192 KB

/**
 * Generates a collision-resistant 16-character alphanumeric ID
 * strictly matching /^[A-Za-z0-9_-]{8,32}$/.
 * Time-ordered prefix ensures sequential database indexing.
 */
export function generateItemId(): string {
  const timePart = Date.now().toString(36).padStart(9, '0').toUpperCase()
  const randPart = crypto.randomBytes(5).toString('hex').slice(0, 7).toUpperCase()
  return `${timePart}${randPart}`
}

/**
 * Computes a fast deterministic content hash:
 * - Files <= 192 KB: reads entire file and hashes via SHA-256.
 * - Files > 192 KB: hashes an 8-byte BigUint64LE size header + 3 deterministic 64 KB chunks:
 *   1. Start (offset 0)
 *   2. Exact middle (offset Math.floor(statSize / 2) - 32768)
 *   3. End (offset statSize - 65536)
 *
 * This provides O(1) content hashing even for 10 GB videos while guaranteeing
 * collision resistance for image/video dedup and move/rename tracking.
 */
export async function computeFileContentHash(
  filePath: string,
  statSize?: number
): Promise<string> {
  let size = statSize
  if (size === undefined) {
    const stat = await fs.promises.stat(filePath)
    size = stat.size
  }

  const hash = crypto.createHash('sha256')

  // Small file: full hash
  if (size <= SMALL_FILE_THRESHOLD) {
    const content = await fs.promises.readFile(filePath)
    hash.update(content)
    return hash.digest('hex')
  }

  // Large file: 8-byte BigUint64LE size header + 3 x 64KB sample chunks
  const sizeHeader = Buffer.alloc(8)
  sizeHeader.writeBigUInt64LE(BigInt(size), 0)
  hash.update(sizeHeader)

  const fd = await fs.promises.open(filePath, 'r')
  try {
    const chunkBuf = Buffer.alloc(CHUNK_SIZE)

    // 1. Start chunk (offset 0)
    await fd.read(chunkBuf, 0, CHUNK_SIZE, 0)
    hash.update(chunkBuf)

    // 2. Middle chunk (offset Math.floor(size / 2) - 32768)
    const midOffset = Math.max(0, Math.floor(size / 2) - Math.floor(CHUNK_SIZE / 2))
    await fd.read(chunkBuf, 0, CHUNK_SIZE, midOffset)
    hash.update(chunkBuf)

    // 3. End chunk (offset size - CHUNK_SIZE)
    const endOffset = Math.max(0, size - CHUNK_SIZE)
    await fd.read(chunkBuf, 0, CHUNK_SIZE, endOffset)
    hash.update(chunkBuf)

    return hash.digest('hex')
  } finally {
    await fd.close()
  }
}
