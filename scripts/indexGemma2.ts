import path from 'node:path'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import { backgroundIndexer } from '../server/clip/backgroundIndexer'
import { resolveEmbeddingsFilePath } from '../server/clip/clipQueryService'
import { saveEmbeddingConfig } from '../server/config/embeddingConfig'

const dbPath = path.resolve('.omnimage', 'catalog.sqlite')
if (!fs.existsSync(dbPath)) {
  console.error(`Database not found at ${dbPath}. Please run the app or seed the catalog first.`)
  process.exit(1)
}

console.log(`\n======================================================`)
console.log(`  Omnimage Pro EmbeddingGemma 2 Batch Indexer (MRL 512D)`)
console.log(`  Target Hardware Acceleration: GPU / DirectML / CUDA   `)
console.log(`======================================================\n`)

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')

const targetLibArg = process.argv[2]?.trim()

const libraries = db.prepare('SELECT id, name, item_count FROM libraries WHERE is_hidden = 0').all() as Array<{
  id: string
  name: string
  item_count: number
}>

if (libraries.length === 0) {
  console.log('No libraries found in catalog.sqlite.')
  db.close()
  process.exit(0)
}

async function run() {
  const selectedLibs = targetLibArg
    ? libraries.filter((l) => l.id.toLowerCase() === targetLibArg.toLowerCase())
    : libraries

  if (selectedLibs.length === 0) {
    console.error(`Library "${targetLibArg}" not found. Available:`, libraries.map((l) => l.id).join(', '))
    db.close()
    process.exit(1)
  }

  // Set configuration to embeddinggemma-2
  saveEmbeddingConfig({
    engine: 'embeddinggemma-2',
    device: 'directml',
  })

  for (const lib of selectedLibs) {
    console.log(`\nIndexing library: [${lib.id}] (${lib.name})`)
    const targetFile = resolveEmbeddingsFilePath(lib.id, 'embeddinggemma-2') || path.resolve(`.omnimage/embeddings/embeddings-${lib.id}.gemma2.bin`)
    console.log(`Target binary: ${targetFile}`)

    const promise = backgroundIndexer.startIndexing(lib.id, db, 'embeddinggemma-2')

    let lastProcessed = 0
    const interval = setInterval(() => {
      const status = backgroundIndexer.getStatus()
      if (status.state === 'indexing') {
        if (status.processed !== lastProcessed) {
          lastProcessed = status.processed
          console.log(`[Gemma2 Indexer] ${status.processed} / ${status.total} items (${status.rateImgPerSec} img/s)`)
        }
      }
    }, 1000)

    await promise
    clearInterval(interval)
    const finalStatus = backgroundIndexer.getStatus()
    console.log(`Finished [${lib.id}]: ${finalStatus.processed}/${finalStatus.total} embeddings written to .gemma2.bin!`)
  }

  db.close()
  console.log('\nAll done! You can now use EmbeddingGemma 2 semantic search in Omnimage.')
}

run().catch((err) => {
  console.error('Indexing failed:', err)
  db.close()
  process.exit(1)
})
