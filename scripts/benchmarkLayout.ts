import path from 'node:path'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import { parseLayoutBinary } from '../src/contracts/binaryFormats.ts'

const dbPath = path.resolve('.omnimage', 'catalog.sqlite')
const db = new Database(dbPath, { readonly: true })

/**
 * Computes raw cosine similarity between two Uint8 vectors of dimension 288.
 */
function computeRawCosine(a: Uint8Array, aOffset: number, b: Uint8Array, bOffset: number, dim = 288): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let k = 0; k < dim; k++) {
    const valA = a[aOffset + k]
    const valB = b[bOffset + k]
    dot += valA * valB
    normA += valA * valA
    normB += valB * valB
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const index = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const weight = index - lower
  if (lower === upper) return sorted[lower]
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

export interface DistributionStats {
  libId: string
  binFileName: string
  version: number
  extractorVersion: number
  N: number
  min: number
  p1: number
  p5: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
  p95: number
  p99: number
  max: number
}

async function analyzeEmpiricalDistribution(libId: string, binFileName: string, numPairs = 20000): Promise<DistributionStats | null> {
  const binPath = path.resolve('.omnimage', 'layout', binFileName)
  if (!fs.existsSync(binPath)) {
    console.log(`Binary not found: ${binPath}`)
    return null
  }

  const rawBuf = fs.readFileSync(binPath)
  const ab = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength)
  const parsed = parseLayoutBinary(ab)
  const N = parsed.ids.length
  const dim = parsed.dim

  if (N < 2) return null

  const vecs = parsed.vectors
  const similarities: number[] = new Array(numPairs)

  for (let p = 0; p < numPairs; p++) {
    const i = Math.floor(Math.random() * N)
    let j = Math.floor(Math.random() * N)
    while (j === i) {
      j = Math.floor(Math.random() * N)
    }

    const sim = computeRawCosine(vecs, i * dim, vecs, j * dim, dim)
    similarities[p] = sim
  }

  similarities.sort((a, b) => a - b)

  const min = similarities[0]
  const p1 = percentile(similarities, 1)
  const p5 = percentile(similarities, 5)
  const p10 = percentile(similarities, 10)
  const p25 = percentile(similarities, 25)
  const p50 = percentile(similarities, 50)
  const p75 = percentile(similarities, 75)
  const p90 = percentile(similarities, 90)
  const p95 = percentile(similarities, 95)
  const p99 = percentile(similarities, 99)
  const max = similarities[similarities.length - 1]

  console.log(`\n============================================================`)
  console.log(`  Empirical Cosine Distribution: [${libId}] (${binFileName})`)
  console.log(`  Items: ${N} | Header v${parsed.version} | Extractor: v${parsed.extractorVersion}`)
  console.log(`------------------------------------------------------------`)
  console.log(`  - p5  (Noise floor):  ${p5.toFixed(4)}`)
  console.log(`  - p50 (Median pair):  ${p50.toFixed(4)}`)
  console.log(`  - p99 (Upper bound):  ${p99.toFixed(4)}`)
  console.log(`  - Range [p5..p99]:    [${p5.toFixed(4)} .. ${p99.toFixed(4)}]`)

  return {
    libId,
    binFileName,
    version: parsed.version,
    extractorVersion: parsed.extractorVersion,
    N,
    min,
    p1,
    p5,
    p10,
    p25,
    p50,
    p75,
    p90,
    p95,
    p99,
    max,
  }
}

function printComparisonTable(results: Array<{ v1: DistributionStats | null; v2: DistributionStats | null }>) {
  console.log(`\n========================================================================================`)
  console.log(`  COMPARATIVE ANALYSIS: Layout v1 vs Layout v2 (Redmean + RGB Sobel)`)
  console.log(`========================================================================================`)
  console.log(`| Library     | Ver | Items  | Extractor |   p5   |  p25   |  p50 (Med) |  p75   |  p99   |`)
  console.log(`|-------------|-----|--------|-----------|--------|--------|------------|--------|--------|`)

  for (const pair of results) {
    if (pair.v1) {
      const v = pair.v1
      console.log(
        `| ${v.libId.padEnd(11)} | v1  | ${String(v.N).padStart(6)} | v${v.extractorVersion}        | ${v.p5.toFixed(4)} | ${v.p25.toFixed(4)} |   ${v.p50.toFixed(4)}   | ${v.p75.toFixed(4)} | ${v.p99.toFixed(4)} |`
      )
    }
    if (pair.v2) {
      const v = pair.v2
      console.log(
        `| ${v.libId.padEnd(11)} | v2  | ${String(v.N).padStart(6)} | v${v.extractorVersion}        | ${v.p5.toFixed(4)} | ${v.p25.toFixed(4)} |   ${v.p50.toFixed(4)}   | ${v.p75.toFixed(4)} | ${v.p99.toFixed(4)} |`
      )
    }
    console.log(`|-------------|-----|--------|-----------|--------|--------|------------|--------|--------|`)
  }
}

async function run() {
  const libs = [
    { id: 'design', pairs: 30000 },
    { id: 'google-flow', pairs: 30000 },
    { id: 'Comfy', pairs: 5000 },
  ]

  const comparisons: Array<{ v1: DistributionStats | null; v2: DistributionStats | null }> = []

  for (const lib of libs) {
    const v1Stats = await analyzeEmpiricalDistribution(lib.id, `layout-${lib.id}.v1.bin`, lib.pairs)
    const v2Stats = await analyzeEmpiricalDistribution(lib.id, `layout-${lib.id}.v2.bin`, lib.pairs)
    comparisons.push({ v1: v1Stats, v2: v2Stats })
  }

  printComparisonTable(comparisons)

  db.close()
  process.exit(0)
}

run().catch((err) => {
  console.error('Benchmark error:', err)
  db.close()
  process.exit(1)
})
