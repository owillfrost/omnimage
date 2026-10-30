import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { parseLayoutBinary, parseEmbeddingsBinary } from '../../src/contracts/binaryFormats'

export type BenchmarkCondition = 'v1' | 'v2' | 'clip' | 'random'

export type AnchorCategory =
  | 'full_bleed_photo'
  | 'minimal_flat'
  | 'isoluminant_edge'
  | 'dense_texture'
  | 'dark_light_wireframe'

export interface AnchorDef {
  id: string
  libraryId: string
  title: string
  category: AnchorCategory
  categoryLabel: string
  description: string
  aspectRatio: number
}

export interface CandidateItem {
  id: string
  libraryId: string
  aspectRatio: number
  thumbUrl: string
}

export interface BlindEvaluationPool {
  anchor: AnchorDef
  candidates: CandidateItem[]
  // Internally keep track of which conditions proposed this candidate
  // Key: candidate item id -> list of conditions that included it in their Top-10 / Random pool
  contributions: Record<string, BenchmarkCondition[]>
}

export interface EvaluationJudgment {
  anchorId: string
  selectedCandidateIds: string[]
}

export interface ConditionStats {
  condition: BenchmarkCondition
  totalProposed: number
  totalRelevant: number
  precisionAt10: number
}

export interface BenchmarkReport {
  timestamp: string
  totalAnchors: number
  totalJudgments: number
  conditions: Record<BenchmarkCondition, ConditionStats>
  categoryBreakdown: Record<
    AnchorCategory,
    {
      categoryLabel: string
      count: number
      v1Precision: number
      v2Precision: number
      clipPrecision: number
      randomPrecision: number
    }
  >
  pairwiseV1vsV2: {
    v2Won: number
    v1Won: number
    tied: number
    detail: Array<{
      anchorId: string
      title: string
      category: string
      v1Score: number
      v2Score: number
      winner: 'v2' | 'v1' | 'tie'
    }>
  }
}

interface LoadedLibraryData {
  libraryId: string
  itemIds: string[]
  idToIndex: Map<string, number>
  aspectRatioById: Map<string, number>
  // Layout v1
  v1Ids: string[]
  v1IndexById: Map<string, number>
  v1Vectors: Uint8Array
  v1InvNorms: Float32Array
  v1Dim: number
  // Layout v2
  v2Ids: string[]
  v2IndexById: Map<string, number>
  v2Vectors: Uint8Array
  v2InvNorms: Float32Array
  v2Dim: number
  // CLIP
  clipIds: string[]
  clipIndexById: Map<string, number>
  clipVectors: Int8Array
  clipInvNorms: Float32Array
  clipDim: number
}

export class BlindBenchmarkEngine {
  private db: Database.Database
  private libraryCache = new Map<string, LoadedLibraryData>()

  constructor(dbPath = path.resolve('.omnimage', 'catalog.sqlite')) {
    this.db = new Database(dbPath, { readonly: true })
  }

  close() {
    this.db.close()
  }

  /**
   * Loads all vector packages into memory for a library and precomputes inverse norms
   * for zero-copy ultra-fast inner-product search across the entire library.
   */
  loadLibrary(libraryId: string): LoadedLibraryData {
    if (this.libraryCache.has(libraryId)) {
      return this.libraryCache.get(libraryId)!
    }

    // 1. SQLite items & aspects
    const rows = this.db
      .prepare('SELECT id, width, height FROM items WHERE library_id = ? AND is_deleted = 0')
      .all(libraryId) as Array<{ id: string; width: number | null; height: number | null }>

    const itemIds = rows.map((r) => r.id)
    const idToIndex = new Map<string, number>()
    const aspectRatioById = new Map<string, number>()
    rows.forEach((r, idx) => {
      idToIndex.set(r.id, idx)
      const aspect = r.width && r.height && r.height > 0 ? r.width / r.height : 1.0
      aspectRatioById.set(r.id, aspect)
    })

    // 2. Layout v1 binary
    const v1Path = path.resolve('.omnimage', 'layout', `layout-${libraryId}.v1.bin`)
    const v1AltPath = path.resolve('.omnimage', 'layout', `layout-${libraryId}.bin`)
    const actualV1Path = fs.existsSync(v1Path) ? v1Path : v1AltPath
    if (!fs.existsSync(actualV1Path)) {
      throw new Error(`Layout v1 binary not found for library: ${libraryId}`)
    }
    const rawV1 = fs.readFileSync(actualV1Path)
    const parsedV1 = parseLayoutBinary(rawV1.buffer.slice(rawV1.byteOffset, rawV1.byteOffset + rawV1.byteLength))
    const v1InvNorms = new Float32Array(parsedV1.ids.length)
    const v1IndexById = new Map<string, number>()
    for (let i = 0; i < parsedV1.ids.length; i++) {
      v1IndexById.set(parsedV1.ids[i], i)
      let sumSq = 0
      const offset = i * parsedV1.dim
      for (let d = 0; d < parsedV1.dim; d++) {
        const val = parsedV1.vectors[offset + d]
        sumSq += val * val
      }
      v1InvNorms[i] = sumSq > 0 ? 1 / Math.sqrt(sumSq) : 0
    }

    // 3. Layout v2 binary
    const v2Path = path.resolve('.omnimage', 'layout', `layout-${libraryId}.v2.bin`)
    if (!fs.existsSync(v2Path)) {
      throw new Error(`Layout v2 binary not found for library: ${libraryId}`)
    }
    const rawV2 = fs.readFileSync(v2Path)
    const parsedV2 = parseLayoutBinary(rawV2.buffer.slice(rawV2.byteOffset, rawV2.byteOffset + rawV2.byteLength))
    const v2InvNorms = new Float32Array(parsedV2.ids.length)
    const v2IndexById = new Map<string, number>()
    for (let i = 0; i < parsedV2.ids.length; i++) {
      v2IndexById.set(parsedV2.ids[i], i)
      let sumSq = 0
      const offset = i * parsedV2.dim
      for (let d = 0; d < parsedV2.dim; d++) {
        const val = parsedV2.vectors[offset + d]
        sumSq += val * val
      }
      v2InvNorms[i] = sumSq > 0 ? 1 / Math.sqrt(sumSq) : 0
    }

    // 4. CLIP binary
    const clipPath = path.resolve('.omnimage', 'embeddings', `embeddings-${libraryId}.bin`)
    if (!fs.existsSync(clipPath)) {
      throw new Error(`CLIP embeddings binary not found for library: ${libraryId}`)
    }
    const rawClip = fs.readFileSync(clipPath)
    const parsedClip = parseEmbeddingsBinary(rawClip.buffer.slice(rawClip.byteOffset, rawClip.byteOffset + rawClip.byteLength))
    const clipInvNorms = new Float32Array(parsedClip.ids.length)
    const clipIndexById = new Map<string, number>()
    for (let i = 0; i < parsedClip.ids.length; i++) {
      clipIndexById.set(parsedClip.ids[i], i)
      let sumSq = 0
      const offset = i * parsedClip.dim
      for (let d = 0; d < parsedClip.dim; d++) {
        const val = parsedClip.vectors[offset + d]
        sumSq += val * val
      }
      clipInvNorms[i] = sumSq > 0 ? 1 / Math.sqrt(sumSq) : 0
    }

    const loaded: LoadedLibraryData = {
      libraryId,
      itemIds,
      idToIndex,
      aspectRatioById,
      v1Ids: parsedV1.ids,
      v1IndexById,
      v1Vectors: parsedV1.vectors,
      v1InvNorms,
      v1Dim: parsedV1.dim,
      v2Ids: parsedV2.ids,
      v2IndexById,
      v2Vectors: parsedV2.vectors,
      v2InvNorms,
      v2Dim: parsedV2.dim,
      clipIds: parsedClip.ids,
      clipIndexById,
      clipVectors: parsedClip.vectors,
      clipInvNorms,
      clipDim: parsedClip.dim,
    }

    this.libraryCache.set(libraryId, loaded)
    return loaded
  }

  /**
   * Top-K layout search over 100% of the library items using Uint8 quantized cosine.
   */
  findTopKLayout(
    lib: LoadedLibraryData,
    version: 'v1' | 'v2',
    anchorId: string,
    k = 10
  ): string[] {
    const isV1 = version === 'v1'
    const indexById = isV1 ? lib.v1IndexById : lib.v2IndexById
    const ids = isV1 ? lib.v1Ids : lib.v2Ids
    const vecs = isV1 ? lib.v1Vectors : lib.v2Vectors
    const invNorms = isV1 ? lib.v1InvNorms : lib.v2InvNorms
    const dim = isV1 ? lib.v1Dim : lib.v2Dim

    const anchorRow = indexById.get(anchorId)
    if (anchorRow === undefined) return []

    const anchorOffset = anchorRow * dim
    const anchorInv = invNorms[anchorRow]
    if (anchorInv === 0) return []

    const N = ids.length
    const scores = new Float32Array(N)

    for (let i = 0; i < N; i++) {
      if (i === anchorRow) {
        scores[i] = -1 // exclude self
        continue
      }
      const candOffset = i * dim
      let dot = 0
      for (let d = 0; d < dim; d++) {
        dot += vecs[anchorOffset + d] * vecs[candOffset + d]
      }
      scores[i] = dot * anchorInv * invNorms[i]
    }

    return this.selectTopK(ids, scores, k)
  }

  /**
   * Top-K semantic search over 100% of the library items using CLIP Int8 quantized cosine.
   */
  findTopKClip(lib: LoadedLibraryData, anchorId: string, k = 10): string[] {
    const anchorRow = lib.clipIndexById.get(anchorId)
    if (anchorRow === undefined) return []

    const anchorOffset = anchorRow * lib.clipDim
    const anchorInv = lib.clipInvNorms[anchorRow]
    if (anchorInv === 0) return []

    const N = lib.clipIds.length
    const scores = new Float32Array(N)

    for (let i = 0; i < N; i++) {
      if (i === anchorRow) {
        scores[i] = -1 // exclude self
        continue
      }
      const candOffset = i * lib.clipDim
      let dot = 0
      for (let d = 0; d < lib.clipDim; d++) {
        dot += lib.clipVectors[anchorOffset + d] * lib.clipVectors[candOffset + d]
      }
      scores[i] = dot * anchorInv * lib.clipInvNorms[i]
    }

    return this.selectTopK(lib.clipIds, scores, k)
  }

  /**
   * Samples random items from the library excluding the anchor and already selected candidates.
   */
  sampleRandomItems(lib: LoadedLibraryData, anchorId: string, exclude: Set<string>, count = 5): string[] {
    const result: string[] = []
    const total = lib.itemIds.length
    let attempts = 0
    while (result.length < count && attempts < total * 2) {
      attempts++
      const idx = Math.floor(Math.random() * total)
      const candidate = lib.itemIds[idx]
      if (candidate !== anchorId && !exclude.has(candidate) && !result.includes(candidate)) {
        result.push(candidate)
      }
    }
    return result
  }

  private selectTopK(ids: string[], scores: Float32Array, k: number): string[] {
    const indices: number[] = []
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] > -0.5) indices.push(i)
    }
    indices.sort((a, b) => scores[b] - scores[a])
    return indices.slice(0, k).map((idx) => ids[idx])
  }

  /**
   * Builds the blind evaluation pool for an anchor:
   * 1. Top-10 v1 (from 100% of library)
   * 2. Top-10 v2 (from 100% of library)
   * 3. Top-10 CLIP (from 100% of library)
   * 4. 4-5 Random items
   * 5. Deduplicated & Fisher-Yates shuffled with attribution masked.
   */
  buildBlindPool(anchor: AnchorDef): BlindEvaluationPool {
    const lib = this.loadLibrary(anchor.libraryId)

    const topV1 = this.findTopKLayout(lib, 'v1', anchor.id, 10)
    const topV2 = this.findTopKLayout(lib, 'v2', anchor.id, 10)
    const topClip = this.findTopKClip(lib, anchor.id, 10)

    const gathered = new Set<string>([...topV1, ...topV2, ...topClip])
    const randomItems = this.sampleRandomItems(lib, anchor.id, gathered, 5)

    const contributions: Record<string, BenchmarkCondition[]> = {}

    const registerItem = (id: string, condition: BenchmarkCondition) => {
      if (!contributions[id]) contributions[id] = []
      if (!contributions[id].includes(condition)) {
        contributions[id].push(condition)
      }
    }

    topV1.forEach((id) => registerItem(id, 'v1'))
    topV2.forEach((id) => registerItem(id, 'v2'))
    topClip.forEach((id) => registerItem(id, 'clip'))
    randomItems.forEach((id) => registerItem(id, 'random'))

    const uniqueIds = Object.keys(contributions)

    // Fisher-Yates shuffle
    for (let i = uniqueIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const temp = uniqueIds[i]
      uniqueIds[i] = uniqueIds[j]
      uniqueIds[j] = temp
    }

    const candidates: CandidateItem[] = uniqueIds.map((id) => ({
      id,
      libraryId: anchor.libraryId,
      aspectRatio: lib.aspectRatioById.get(id) || 1.0,
      thumbUrl: `/api/catalog/media?library=${anchor.libraryId}&id=${id}&type=thumb`,
    }))

    return {
      anchor,
      candidates,
      contributions,
    }
  }

  /**
   * Evaluates user judgments across the benchmark session and generates the full analysis report.
   */
  evaluateJudgments(
    pools: BlindEvaluationPool[],
    judgments: EvaluationJudgment[]
  ): BenchmarkReport {
    const judgmentMap = new Map<string, Set<string>>()
    for (const j of judgments) {
      judgmentMap.set(j.anchorId, new Set(j.selectedCandidateIds))
    }

    const conditionTotals: Record<BenchmarkCondition, { proposed: number; relevant: number }> = {
      v1: { proposed: 0, relevant: 0 },
      v2: { proposed: 0, relevant: 0 },
      clip: { proposed: 0, relevant: 0 },
      random: { proposed: 0, relevant: 0 },
    }

    const categoryStats: Record<
      AnchorCategory,
      {
        categoryLabel: string
        count: number
        v1Proposed: number
        v1Relevant: number
        v2Proposed: number
        v2Relevant: number
        clipProposed: number
        clipRelevant: number
        randomProposed: number
        randomRelevant: number
      }
    > = {
      full_bleed_photo: { categoryLabel: 'Full-bleed Photo', count: 0, v1Proposed: 0, v1Relevant: 0, v2Proposed: 0, v2Relevant: 0, clipProposed: 0, clipRelevant: 0, randomProposed: 0, randomRelevant: 0 },
      minimal_flat: { categoryLabel: 'Minimal / Flat Image', count: 0, v1Proposed: 0, v1Relevant: 0, v2Proposed: 0, v2Relevant: 0, clipProposed: 0, clipRelevant: 0, randomProposed: 0, randomRelevant: 0 },
      isoluminant_edge: { categoryLabel: 'Isoluminant Edge', count: 0, v1Proposed: 0, v1Relevant: 0, v2Proposed: 0, v2Relevant: 0, clipProposed: 0, clipRelevant: 0, randomProposed: 0, randomRelevant: 0 },
      dense_texture: { categoryLabel: 'Dense Texture / Clutter', count: 0, v1Proposed: 0, v1Relevant: 0, v2Proposed: 0, v2Relevant: 0, clipProposed: 0, clipRelevant: 0, randomProposed: 0, randomRelevant: 0 },
      dark_light_wireframe: { categoryLabel: 'Dark/Light Wireframe Pair', count: 0, v1Proposed: 0, v1Relevant: 0, v2Proposed: 0, v2Relevant: 0, clipProposed: 0, clipRelevant: 0, randomProposed: 0, randomRelevant: 0 },
    }

    let v2Won = 0
    let v1Won = 0
    let tied = 0
    const pairwiseDetail: BenchmarkReport['pairwiseV1vsV2']['detail'] = []

    for (const pool of pools) {
      const selectedSet = judgmentMap.get(pool.anchor.id) || new Set<string>()
      const cat = pool.anchor.category
      if (categoryStats[cat]) {
        categoryStats[cat].count++
      }

      let v1Score = 0
      let v2Score = 0

      for (const [candidateId, conditions] of Object.entries(pool.contributions)) {
        const isSelected = selectedSet.has(candidateId)

        for (const cond of conditions) {
          conditionTotals[cond].proposed++
          if (isSelected) {
            conditionTotals[cond].relevant++
          }

          if (categoryStats[cat]) {
            if (cond === 'v1') {
              categoryStats[cat].v1Proposed++
              if (isSelected) categoryStats[cat].v1Relevant++
            } else if (cond === 'v2') {
              categoryStats[cat].v2Proposed++
              if (isSelected) categoryStats[cat].v2Relevant++
            } else if (cond === 'clip') {
              categoryStats[cat].clipProposed++
              if (isSelected) categoryStats[cat].clipRelevant++
            } else if (cond === 'random') {
              categoryStats[cat].randomProposed++
              if (isSelected) categoryStats[cat].randomRelevant++
            }
          }

          if (cond === 'v1' && isSelected) v1Score++
          if (cond === 'v2' && isSelected) v2Score++
        }
      }

      let winner: 'v2' | 'v1' | 'tie' = 'tie'
      if (v2Score > v1Score) {
        v2Won++
        winner = 'v2'
      } else if (v1Score > v2Score) {
        v1Won++
        winner = 'v1'
      } else {
        tied++
        winner = 'tie'
      }

      pairwiseDetail.push({
        anchorId: pool.anchor.id,
        title: pool.anchor.title,
        category: pool.anchor.categoryLabel,
        v1Score,
        v2Score,
        winner,
      })
    }

    const calcPrec = (rel: number, prop: number) => (prop > 0 ? Number((rel / prop).toFixed(4)) : 0)

    const conditionsResult: Record<BenchmarkCondition, ConditionStats> = {
      v1: {
        condition: 'v1',
        totalProposed: conditionTotals.v1.proposed,
        totalRelevant: conditionTotals.v1.relevant,
        precisionAt10: calcPrec(conditionTotals.v1.relevant, conditionTotals.v1.proposed),
      },
      v2: {
        condition: 'v2',
        totalProposed: conditionTotals.v2.proposed,
        totalRelevant: conditionTotals.v2.relevant,
        precisionAt10: calcPrec(conditionTotals.v2.relevant, conditionTotals.v2.proposed),
      },
      clip: {
        condition: 'clip',
        totalProposed: conditionTotals.clip.proposed,
        totalRelevant: conditionTotals.clip.relevant,
        precisionAt10: calcPrec(conditionTotals.clip.relevant, conditionTotals.clip.proposed),
      },
      random: {
        condition: 'random',
        totalProposed: conditionTotals.random.proposed,
        totalRelevant: conditionTotals.random.relevant,
        precisionAt10: calcPrec(conditionTotals.random.relevant, conditionTotals.random.proposed),
      },
    }

    const catBreakdown = {} as BenchmarkReport['categoryBreakdown']
    for (const [key, val] of Object.entries(categoryStats)) {
      const k = key as AnchorCategory
      catBreakdown[k] = {
        categoryLabel: val.categoryLabel,
        count: val.count,
        v1Precision: calcPrec(val.v1Relevant, val.v1Proposed),
        v2Precision: calcPrec(val.v2Relevant, val.v2Proposed),
        clipPrecision: calcPrec(val.clipRelevant, val.clipProposed),
        randomPrecision: calcPrec(val.randomRelevant, val.randomProposed),
      }
    }

    return {
      timestamp: new Date().toISOString(),
      totalAnchors: pools.length,
      totalJudgments: judgments.length,
      conditions: conditionsResult,
      categoryBreakdown: catBreakdown,
      pairwiseV1vsV2: {
        v2Won,
        v1Won,
        tied,
        detail: pairwiseDetail,
      },
    }
  }

  /**
   * Generates a markdown summary artifact of the benchmark results.
   */
  formatReportMarkdown(report: BenchmarkReport): string {
    const pV1 = (report.conditions.v1.precisionAt10 * 100).toFixed(1)
    const pV2 = (report.conditions.v2.precisionAt10 * 100).toFixed(1)
    const pClip = (report.conditions.clip.precisionAt10 * 100).toFixed(1)
    const pRand = (report.conditions.random.precisionAt10 * 100).toFixed(1)

    let md = `# Blind Layout Benchmark Evaluation Report\n\n`
    md += `**Evaluated:** ${report.timestamp} | **Total Anchors:** ${report.totalAnchors}\n\n`
    md += `## 1. Global Precision Comparison (Top-10 Precision)\n\n`
    md += `| Method | Description | Precision@10 | Hits / Proposed |\n`
    md += `|---|---|:---:|:---:|\n`
    md += `| **Layout v2** | Redmean Mass + RGB Multi-Channel Sobel | **${pV2}%** | ${report.conditions.v2.totalRelevant} / ${report.conditions.v2.totalProposed} |\n`
    md += `| **Layout v1** | Grayscale Luminance Rec. 601 | ${pV1}% | ${report.conditions.v1.totalRelevant} / ${report.conditions.v1.totalProposed} |\n`
    md += `| **CLIP ViT-B/32** | Semantic Baseline | ${pClip}% | ${report.conditions.clip.totalRelevant} / ${report.conditions.clip.totalProposed} |\n`
    md += `| **Random** | Chance Floor Baseline | ${pRand}% | ${report.conditions.random.totalRelevant} / ${report.conditions.random.totalProposed} |\n\n`

    md += `## 2. Pairwise Direct Match: Layout v2 vs Layout v1\n\n`
    md += `- **v2 Won:** ${report.pairwiseV1vsV2.v2Won} (${((report.pairwiseV1vsV2.v2Won / Math.max(1, report.totalAnchors)) * 100).toFixed(1)}%)\n`
    md += `- **Tied:** ${report.pairwiseV1vsV2.tied} (${((report.pairwiseV1vsV2.tied / Math.max(1, report.totalAnchors)) * 100).toFixed(1)}%)\n`
    md += `- **v1 Won:** ${report.pairwiseV1vsV2.v1Won} (${((report.pairwiseV1vsV2.v1Won / Math.max(1, report.totalAnchors)) * 100).toFixed(1)}%)\n\n`

    md += `## 3. Breakdown by Difficult Case Category\n\n`
    md += `| Category | Anchors | Layout v2 | Layout v1 | CLIP | Random |\n`
    md += `|---|:---:|:---:|:---:|:---:|:---:|\n`
    for (const [, c] of Object.entries(report.categoryBreakdown)) {
      if (c.count === 0) continue
      md += `| **${c.categoryLabel}** | ${c.count} | **${(c.v2Precision * 100).toFixed(1)}%** | ${(c.v1Precision * 100).toFixed(1)}% | ${(c.clipPrecision * 100).toFixed(1)}% | ${(c.randomPrecision * 100).toFixed(1)}% |\n`
    }

    md += `\n## 4. Per-Anchor Detail\n\n`
    md += `| Anchor ID | Category | Title | v1 Hits | v2 Hits | Winner |\n`
    md += `|---|---|---|:---:|:---:|:---:|\n`
    for (const d of report.pairwiseV1vsV2.detail) {
      const badge = d.winner === 'v2' ? '🟢 v2' : d.winner === 'v1' ? '🔴 v1' : '⚪ Tie'
      md += `| \`${d.anchorId}\` | ${d.category} | ${d.title} | ${d.v1Score} | ${d.v2Score} | ${badge} |\n`
    }

    return md
  }
}
