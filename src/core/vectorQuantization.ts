/**
 * Vector Quantization & Quantized Cosine Similarity
 * 
 * Implements strict mathematical compatibility with Xenova/clip-vit-base-patch32 Int8 quantized embeddings.
 * Output vectors are 512-dimensional Int8Array with values in [-127, 127].
 */

/**
 * Quantizes a float32 vector (L2-normalized or raw) to Int8 [-127..127].
 * Preserves strict 1:1 mathematical parity with CLIP Int8 projection format.
 */
export function quantizeNormalizedFloat32ToInt8(
  floatArr: Float32Array | number[] | ArrayLike<number>,
  dim = 512
): Int8Array {
  let norm = 0
  for (let i = 0; i < floatArr.length; i++) {
    norm += floatArr[i] * floatArr[i]
  }
  norm = Math.sqrt(norm) || 1

  let maxAbs = 0
  for (let i = 0; i < floatArr.length; i++) {
    const v = Math.abs(floatArr[i] / norm)
    if (v > maxAbs) maxAbs = v
  }
  const scale = maxAbs > 0 ? 127 / maxAbs : 127

  const out = new Int8Array(dim)
  for (let i = 0; i < dim; i++) {
    const v = ((floatArr[i] || 0) / norm) * scale
    out[i] = Math.max(-127, Math.min(127, Math.round(v)))
  }
  return out
}

/**
 * Computes cosine similarity in [-1, 1] between two L2-normalized Int8 quantized vectors.
 * Int8 values are in [-127, 127], so dot product * invNormA * invNormB is exact quantized cosine.
 */
export function computeQuantizedCosine(
  vecs: Int8Array,
  dim: number,
  rowA: number,
  rowB: number,
  invNorms?: Float32Array | null
): number {
  if (dim <= 0) return 0
  const offsetA = rowA * dim
  const offsetB = rowB * dim

  if (!invNorms) {
    let dot = 0
    let normA = 0
    let normB = 0
    for (let d = 0; d < dim; d++) {
      const a = vecs[offsetA + d]
      const b = vecs[offsetB + d]
      dot += a * b
      normA += a * a
      normB += b * b
    }
    if (normA === 0 || normB === 0) return 0
    return dot / Math.sqrt(normA * normB)
  }

  let dot = 0
  for (let d = 0; d < dim; d++) {
    dot += vecs[offsetA + d] * vecs[offsetB + d]
  }
  return dot * (invNorms[rowA] ?? 0) * (invNorms[rowB] ?? 0)
}

/**
 * Computes cosine similarity between an arbitrary query vector (e.g. from text or uploaded image)
 * and a row in a contiguous Int8Array matrix.
 */
export function computeQuantizedCosineWithQuery(
  queryVec: Int8Array | number[] | ArrayLike<number>,
  targetVecs: Int8Array,
  dim: number,
  targetRow: number,
  targetInvNorm?: number
): number {
  if (dim <= 0) return 0
  const offset = targetRow * dim
  let dot = 0
  let queryNormSq = 0
  let targetNormSq = 0

  if (targetInvNorm !== undefined && targetInvNorm > 0) {
    for (let d = 0; d < dim; d++) {
      const q = queryVec[d]
      dot += q * targetVecs[offset + d]
      queryNormSq += q * q
    }
    if (queryNormSq === 0) return 0
    return dot * (1 / Math.sqrt(queryNormSq)) * targetInvNorm
  }

  for (let d = 0; d < dim; d++) {
    const q = queryVec[d]
    const t = targetVecs[offset + d]
    dot += q * t
    queryNormSq += q * q
    targetNormSq += t * t
  }
  if (queryNormSq === 0 || targetNormSq === 0) return 0
  return dot / Math.sqrt(queryNormSq * targetNormSq)
}
