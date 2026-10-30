import path from 'node:path'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import { backgroundIndexer } from '../server/clip/backgroundIndexer'
import { resolveEmbeddingsFilePath } from '../server/clip/clipQueryService'
import type { EmbeddingEngineType } from '../server/config/embeddingConfig'
import { parseEmbeddingsBinary } from '../src/contracts/binaryFormats'

const dbPath = path.resolve('.omnimage', 'catalog.sqlite')
if (!fs.existsSync(dbPath)) {
  console.error(`Database not found at ${dbPath}. Please run the app or seed the catalog first.`)
  process.exit(1)
}

const args = process.argv.slice(2)
let selectedEngineArg: 'clip' | 'gemma' | 'all' = 'all'
let targetLibArg: string | null = null

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--engine' && args[i + 1]) {
    const val = args[++i].toLowerCase()
    if (val === 'clip' || val === 'gemma' || val === 'all') {
      selectedEngineArg = val
    }
  } else if (arg === '--lib' && args[i + 1]) {
    targetLibArg = args[++i].trim()
  }
}

console.log(`\n========================================================`)
console.log(`  Omnimage Unified Dual-Engine Embedding Indexer        `)
console.log(`  Engine: ${selectedEngineArg.toUpperCase()} | Library: ${targetLibArg || 'ALL'} `)
console.log(`========================================================\n`)

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')

const libraries = db
  .prepare('SELECT id, name, item_count FROM libraries WHERE is_hidden = 0')
  .all() as Array<{
  id: string
  name: string
  item_count: number
}>

if (libraries.length === 0) {
  console.log('No libraries found in catalog.sqlite.')
  db.close()
  process.exit(0)
}

const selectedLibs = targetLibArg
  ? libraries.filter((l) => l.id.toLowerCase() === targetLibArg.toLowerCase())
  : libraries

if (selectedLibs.length === 0) {
  console.error(
    `Library "${targetLibArg}" not found. Available:`,
    libraries.map((l) => l.id).join(', ')
  )
  db.close()
  process.exit(1)
}

const enginesToRun: EmbeddingEngineType[] =
  selectedEngineArg === 'clip'
    ? ['clip-vit-b32']
    : selectedEngineArg === 'gemma'
    ? ['embeddinggemma-2']
    : ['clip-vit-b32', 'embeddinggemma-2']

async function run() {
  for (const lib of selectedLibs) {
    for (const engine of enginesToRun) {
      const isGemma = engine === 'embeddinggemma-2'
      const label = isGemma ? 'Gemma2 (Text)' : 'CLIP ViT-B/32 (Visual)'
      console.log(`\n--- Indexing [${lib.id}] (${lib.name}) with ${label} ---`)
      console.log(`[${label}] Preparing engine pipeline and parsing database items...`)

      const promise = backgroundIndexer.startIndexing(lib.id, db, engine)

      let lastProcessed = 0
      let dots = 0
      const interval = setInterval(() => {
        const status = backgroundIndexer.getStatus()
        if (status.state === 'indexing') {
          if (status.processed !== lastProcessed) {
            lastProcessed = status.processed
            console.log(
              `[${label}] ${status.processed} / ${status.total} items (${status.rateImgPerSec} items/s)`
            )
          } else if (status.processed === 0 && dots++ % 3 === 0) {
            process.stdout.write('.')
          }
        }
      }, 1000)

      await promise
      clearInterval(interval)
      const finalStatus = backgroundIndexer.getStatus()
      console.log(`Completed [${lib.id}] ${label}: ${finalStatus.processed}/${finalStatus.total}`)
    }
  }

  // Update manifest.json
  const manifestPath = path.resolve('.omnimage', 'embeddings', 'manifest.json')
  const manifestData: Record<string, any> = {
    updatedAt: new Date().toISOString(),
    libraries: {},
  }

  for (const lib of libraries) {
    manifestData.libraries[lib.id] = {}
    for (const engine of ['clip-vit-b32', 'embeddinggemma-2'] as EmbeddingEngineType[]) {
      const p = resolveEmbeddingsFilePath(lib.id, engine)
      if (p && fs.existsSync(p)) {
        try {
          const buf = fs.readFileSync(p)
          const parsed = parseEmbeddingsBinary(
            buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
          )
          const key = engine === 'clip-vit-b32' ? 'clip' : 'gemma'
          manifestData.libraries[lib.id][key] = {
            count: parsed.ids.length,
            dim: parsed.dim,
            file: path.basename(p),
            sizeBytes: buf.byteLength,
          }
        } catch {
          // ignore corrupted/legacy
        }
      }
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2), 'utf-8')
  console.log(`\nSaved manifest to ${manifestPath}`)

  db.close()
  console.log('\nAll done! Both CLIP and Gemma2 embeddings are ready.')
}

run().catch((err) => {
  console.error('Reindexing failed:', err)
  db.close()
  process.exit(1)
})
