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

async function analyzeEmpiricalDistribution(libId: string, binFileName: string, numPairs = 20000) {
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

  console.log(`\n============================================================`)
  console.log(`  Empirical Cosine Distribution Analysis: [${libId}] (${binFileName})`)
  console.log(`  Items: ${N} | Dimension: ${dim} | Format Version: v${parsed.version}`)
  console.log(`============================================================`)

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

  console.log(`Distribution of ${numPairs.toLocaleString()} random pairs:`)
  console.log(`  - Min: ${min.toFixed(4)}`)
  console.log(`  - p1:  ${p1.toFixed(4)}`)
  console.log(`  - p5:  ${p5.toFixed(4)}  <--- Empirical Lower Bound (Noise Floor)`)
  console.log(`  - p10: ${p10.toFixed(4)}`)
  console.log(`  - p25: ${p25.toFixed(4)}`)
  console.log(`  - p50: ${p50.toFixed(4)}  (Median similarity of random unrelated layouts)`)
  console.log(`  - p75: ${p75.toFixed(4)}`)
  console.log(`  - p90: ${p90.toFixed(4)}`)
  console.log(`  - p95: ${p95.toFixed(4)}`)
  console.log(`  - p99: ${p99.toFixed(4)}  <--- Empirical Upper Bound (Highly Co-Aligned)`)
  console.log(`  - Max: ${max.toFixed(4)}`)
  console.log(`\nComparison with hardcoded constants:`)
  console.log(`  Current hardcoded stretch: [0.35 .. 0.95]`)
  console.log(`  Empirically derived [p5 .. p99]: [${p5.toFixed(4)} .. ${p99.toFixed(4)}]`)

  return { min, p1, p5, p10, p25, p50, p75, p90, p95, p99, max }
}

async function run() {
  // 1. Measure empirical distribution for v1 on design and google-flow
  await analyzeEmpiricalDistribution('design', 'layout-design.v1.bin', 30000)
  await analyzeEmpiricalDistribution('google-flow', 'layout-google-flow.v1.bin', 30000)
  await analyzeEmpiricalDistribution('Comfy', 'layout-Comfy.v1.bin', 5000)

  db.close()
  process.exit(0)
}

run().catch((err) => {
  console.error('Benchmark error:', err)
  db.close()
  process.exit(1)
})
