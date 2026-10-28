import {
  calculateWeightedPaletteDistance,
  calculateSplitToningDistance,
  getCachedLab,
  getCachedHsl,
  type GradeTuningOptions,
} from '../core/colorClustering'
import {
  type SplitToningProfile,
  deriveFallbackSplitToningFromPalette,
} from '../core/paletteExtractor'
import { computeQuantizedCosine } from '../core/vectorQuantization'

export type SimilaritySortMode = 'hybrid' | 'visual' | 'color' | 'grade'

export interface WorkerArtworkColorItem {
  id: string
  dominantColor: string
  palette?: string[]
  paletteWeights?: number[]
  splitToning?: SplitToningProfile
  aspectRatio?: number
  tags?: string[]
  tokens?: string[]
}

export type ColorSortWorkerRequest =
  | {
      type: 'SET_ITEMS'
      items: WorkerArtworkColorItem[]
      listVersion?: number
    }
  | {
      type: 'SET_EMBEDDINGS'
      library: string
      dim: number
      ids: string[]
      vectors: Int8Array
    }
  | {
      type: 'SORT_BY_ANCHOR'
      requestId: number
      targetId: string
      targetColor: string
      targetPalette?: string[]
      targetPaletteWeights?: number[]
      targetSplitToning?: SplitToningProfile
      targetGradeTuning?: GradeTuningOptions
      targetAspectRatio?: number
      targetTags?: string[]
      targetTokens?: string[]
      mode?: SimilaritySortMode
      listVersion?: number
      targetEmbedding?: Int8Array | number[]
      isTextAnchor?: boolean
    }

export interface ColorSortWorkerResponse {
  type: 'SORT_RESULT'
  requestId: number
  targetId: string
  mode: SimilaritySortMode
  sortedIndices: Int32Array
  distances: Float32Array
  similarities: Uint8Array
  hasVisualEmbeddings: boolean
  listVersion?: number
}

let currentItems: WorkerArtworkColorItem[] = []
let itemTokenSets: Set<string>[] = []

// Map from full artwork id (e.g. 'design-ABC123') -> row index in currentEmbeddings
const embeddingIndexById = new Map<string, number>()
let currentEmbeddingVectors: Int8Array | null = null
let currentEmbeddingDim = 512
let currentInvNorms: Float32Array | null = null
let currentListVersion = 0

const STOP_WORDS = new Set([
  'the', 'and', 'with', 'for', 'from', 'that', 'this', 'into', 'over', 'under',
  'image', 'photo', 'picture', 'style', 'prompt', 'local', 'asset', 'design',
  'uma', 'com', 'para', 'por', 'dos', 'das', 'nos', 'nas',
])

function buildTokenSet(tags?: string[], tokens?: string[]): Set<string> {
  const set = new Set<string>()
  if (tags) {
    for (let i = 0; i < tags.length; i++) {
      const t = tags[i].toLowerCase().trim()
      if (t.length >= 2) set.add(t)
    }
  }
  if (tokens) {
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i].toLowerCase().trim()
      if (t.length >= 3 && !STOP_WORDS.has(t)) set.add(t)
    }
  }
  return set
}

self.onmessage = (event: MessageEvent<ColorSortWorkerRequest>) => {
  const msg = event.data

  if (msg.type === 'SET_EMBEDDINGS') {
    const { library, dim, ids, vectors } = msg
    currentEmbeddingDim = dim || 512
    currentEmbeddingVectors = vectors
    currentInvNorms = new Float32Array(ids.length)
    for (let i = 0; i < ids.length; i++) {
      const offset = i * currentEmbeddingDim
      let norm = 0
      for (let d = 0; d < currentEmbeddingDim; d++) {
        const v = vectors[offset + d]
        norm += v * v
      }
      currentInvNorms[i] = norm > 0 ? 1 / Math.sqrt(norm) : 0
    }
    // Clear previous entries for this library or rebuild lookup
    for (let i = 0; i < ids.length; i++) {
      const rawId = ids[i]
      const fullId = rawId.startsWith(`${library}-`) ? rawId : `${library}-${rawId}`
      embeddingIndexById.set(fullId, i)
      embeddingIndexById.set(rawId, i)
    }
    return
  }

  if (msg.type === 'SET_ITEMS') {
    currentListVersion = msg.listVersion ?? 0
    currentItems = msg.items
    itemTokenSets = new Array(currentItems.length)
    // Pre-warm CIELAB and HSL vector caches + token sets in background thread
    for (let i = 0; i < currentItems.length; i++) {
      const item = currentItems[i]
      if (item.dominantColor) {
        getCachedLab(item.dominantColor)
        getCachedHsl(item.dominantColor)
      }
      if (item.palette) {
        for (let j = 0; j < item.palette.length; j++) {
          getCachedLab(item.palette[j])
          getCachedHsl(item.palette[j])
        }
      }
      itemTokenSets[i] = buildTokenSet(item.tags, item.tokens)
    }
    return
  }

  if (msg.type === 'SORT_BY_ANCHOR') {
    const {
      requestId,
      targetId,
      targetColor,
      targetPalette,
      targetPaletteWeights,
      targetSplitToning,
      targetGradeTuning,
      targetAspectRatio,
      targetTags,
      targetTokens,
      mode = 'hybrid',
      isTextAnchor = false,
    } = msg

    const len = currentItems.length
    const indices = new Int32Array(len)
    const tempDistances = new Float32Array(len)

    const fallbackTarget = targetColor || '#ffffff'
    const anchorColors =
      targetPalette && targetPalette.length > 0 ? targetPalette : [fallbackTarget]
    const anchorTokenSet = buildTokenSet(targetTags, targetTokens)
    const anchorAspect = targetAspectRatio || 1.0
    const anchorGrade =
      targetSplitToning ||
      deriveFallbackSplitToningFromPalette(anchorColors, targetPaletteWeights)

    const vecs = currentEmbeddingVectors
    const dim = currentEmbeddingDim

    let externalTargetVec: Int8Array | null = null
    let externalTargetInvNorm = 0
    if (msg.targetEmbedding) {
      externalTargetVec =
        msg.targetEmbedding instanceof Int8Array
          ? msg.targetEmbedding
          : new Int8Array(msg.targetEmbedding)
      let norm = 0
      for (let d = 0; d < dim; d++) {
        const v = externalTargetVec[d]
        norm += v * v
      }
      externalTargetInvNorm = norm > 0 ? 1 / Math.sqrt(norm) : 0
    }

    const anchorEmbRow = embeddingIndexById.get(targetId)
    const hasExternalVec =
      externalTargetVec !== null && externalTargetVec.length === dim
    const canUseClip =
      mode !== 'color' &&
      mode !== 'grade' &&
      vecs !== null &&
      (hasExternalVec ||
        (anchorEmbRow !== undefined && (anchorEmbRow + 1) * dim <= vecs.length))

    for (let i = 0; i < len; i++) {
      indices[i] = i
      const art = currentItems[i]

      if (art.id === targetId) {
        tempDistances[i] = -1 // Guarantees anchor is strictly first (index 0 after sort)
        continue
      }

      const candColors =
        art.palette && art.palette.length > 0
          ? art.palette
          : [art.dominantColor || '#18181b']

      if (mode === 'grade') {
        const candGrade =
          art.splitToning ||
          deriveFallbackSplitToningFromPalette(candColors, art.paletteWeights)
        tempDistances[i] = calculateSplitToningDistance(anchorGrade, candGrade, targetGradeTuning)
        continue
      }

      // 1. Weighted Full-Palette Distance (normalized to [0..100], smaller = more similar)
      const paletteDist = calculateWeightedPaletteDistance(
        anchorColors,
        targetPaletteWeights,
        candColors,
        art.paletteWeights
      )

      if (mode === 'color') {
        tempDistances[i] = paletteDist
        continue
      }

      // Convert paletteDist (~0..85) into a normalized color similarity [0..1]
      const colorSim = Math.max(0, Math.min(1, 1 - paletteDist / 85))

      // 2. Stylistic Tag & Prompt Token Overlap [0..1]
      let tokenSim = 0
      const candTokens = itemTokenSets[i]
      if (anchorTokenSet.size > 0 && candTokens && candTokens.size > 0) {
        let shared = 0
        for (const t of anchorTokenSet) {
          if (candTokens.has(t)) shared++
        }
        if (shared > 0) {
          const union = anchorTokenSet.size + candTokens.size - shared
          const jaccard = shared / union
          // Boost even 1-2 shared stylistic tags
          tokenSim = Math.min(1, jaccard * 2.2 + (shared >= 2 ? 0.25 : 0.1))
        }
      }

      // 3. Aspect Ratio / Framing Cohesion [0..1] (portrait vs landscape vs square)
      const candAspect = art.aspectRatio || 1.0
      const aspectDiff = Math.abs(Math.log(anchorAspect / candAspect))
      const aspectSim = Math.max(0, 1 - aspectDiff * 1.1)

      // 4. Visual Embedding (CLIP / SigLIP) Cosine Similarity [0..1]
      let finalSimilarity = 0
      const candEmbRow = canUseClip ? embeddingIndexById.get(art.id) : undefined

      if (canUseClip && candEmbRow !== undefined && vecs) {
        let rawCos = 0
        if (hasExternalVec && externalTargetVec !== null) {
          const offsetCand = candEmbRow * dim
          let dot = 0
          for (let d = 0; d < dim; d++) {
            dot += externalTargetVec[d] * vecs[offsetCand + d]
          }
          rawCos =
            dot *
            externalTargetInvNorm *
            (currentInvNorms ? currentInvNorms[candEmbRow] ?? 0 : 0)
        } else if (anchorEmbRow !== undefined) {
          rawCos = computeQuantizedCosine(
            vecs,
            dim,
            anchorEmbRow,
            candEmbRow,
            currentInvNorms
          )
        }
        let clipSim = 0
        const isTargetText = Boolean(isTextAnchor || targetTags?.includes('clip-text-query'))

        if (isTargetText) {
          // Zero-shot text-to-image cosine distribution in CLIP ViT-B/32:
          // Below 0.12 = unrelated; 0.20+ = relevant; 0.30+ = high match
          clipSim = Math.max(0, Math.min(1, (rawCos - 0.12) / 0.23))
          if (mode === 'visual') {
            finalSimilarity = clipSim
          } else {
            // 'hybrid': mainly CLIP semantic match (92%), plus slight token/tag bonus (8%)
            finalSimilarity = clipSim * 0.92 + tokenSim * 0.08
          }
        } else {
          // Typical CLIP image-to-image cosine sits in [0.18, 0.92]; stretch for crisp perceptual separation
          clipSim = Math.max(0, Math.min(1, (rawCos - 0.18) / 0.72))

          if (mode === 'visual') {
            finalSimilarity = clipSim * 0.88 + colorSim * 0.07 + aspectSim * 0.05
          } else {
            // 'hybrid': Aesthetic + Style + Color Harmony + Tags
            finalSimilarity =
              clipSim * 0.68 +
              colorSim * 0.20 +
              tokenSim * 0.07 +
              aspectSim * 0.05
          }
        }
      } else {
        // High-precision multi-signal fallback when CLIP embedding isn't indexed yet for this item
        if (anchorTokenSet.size > 0) {
          finalSimilarity = colorSim * 0.68 + tokenSim * 0.22 + aspectSim * 0.10
        } else {
          finalSimilarity = colorSim * 0.86 + aspectSim * 0.14
        }
      }

      // Map similarity [0..1] back to a pseudo-distance [0..85] so existing code remains 100% compatible
      tempDistances[i] = (1 - finalSimilarity) * 85
    }

    // Sort indices ascending by their computed distance
    indices.sort((a, b) => tempDistances[a] - tempDistances[b])

    const sortedDistances = new Float32Array(len)
    const sortedSimilarities = new Uint8Array(len)

    for (let i = 0; i < len; i++) {
      const origIdx = indices[i]
      const rawDist = tempDistances[origIdx]
      if (rawDist < 0) {
        sortedDistances[i] = 0
        sortedSimilarities[i] = 100
      } else {
        sortedDistances[i] = rawDist
        sortedSimilarities[i] = Math.max(
          0,
          Math.min(100, Math.round((1 - rawDist / 85) * 100))
        )
      }
    }

    const response: ColorSortWorkerResponse = {
      type: 'SORT_RESULT',
      requestId,
      targetId,
      mode,
      sortedIndices: indices,
      distances: sortedDistances,
      similarities: sortedSimilarities,
      hasVisualEmbeddings: canUseClip,
      listVersion: msg.listVersion ?? currentListVersion,
    }

    // Zero-copy Transferable ArrayBuffers back to Main Thread
    ;(self as unknown as Worker).postMessage(response, [
      indices.buffer,
      sortedDistances.buffer,
      sortedSimilarities.buffer,
    ])
  }
}
