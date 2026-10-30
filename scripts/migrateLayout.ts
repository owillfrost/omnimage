import path from 'node:path'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import { LayoutIndexer, resolveLayoutFilePath } from '../server/layout/layoutIndexer.ts'

const dbPath = path.resolve('.omnimage', 'catalog.sqlite')
console.log(`Connecting to database at ${dbPath}...`)

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

const indexer = new LayoutIndexer()

async function run() {
  const selectedLibs = targetLibArg
    ? libraries.filter((l) => l.id.toLowerCase() === targetLibArg.toLowerCase())
    : libraries

  if (selectedLibs.length === 0) {
    console.error(`Library "${targetLibArg}" not found. Available libraries:`, libraries.map((l) => l.id).join(', '))
    db.close()
    process.exit(1)
  }

  console.log(`\n======================================================`)
  console.log(`  Omnimage Spatial Layout & Composition Indexer (288D) `)
  console.log(`======================================================\n`)

  for (const lib of selectedLibs) {
    console.log(`\nLibrary: [${lib.id}] (${lib.name})`)
    const binPath = resolveLayoutFilePath(lib.id)
    const exists = fs.existsSync(binPath)
    console.log(`Target binary: ${binPath} (Status: ${exists ? 'Existing, will resume/update' : 'New'})`)

    let lastLogged = 0

    const progressTimer = setInterval(() => {
      const s = indexer.getStatus()
      if (s.processed > lastLogged) {
        lastLogged = s.processed
        const pct = ((s.processed / (s.total || 1)) * 100).toFixed(1)
        console.log(`  -> Progress: ${s.processed}/${s.total} (${pct}%) | Rate: ${s.ratePerSec} items/s`)
      }
    }, 2000)

    try {
      const result = await indexer.startIndexing(lib.id, db, {
        batchYield: 50,
      })
      clearInterval(progressTimer)

      console.log(`Done [${lib.id}] in ${result.elapsedSec}s:`)
      console.log(`  - Total items: ${result.total}`)
      console.log(`  - Newly indexed: ${result.newlyIndexed}`)
      console.log(`  - Reused existing: ${result.existing}`)
    } catch (err) {
      clearInterval(progressTimer)
      console.error(`Error during layout indexing of [${lib.id}]:`, err)
    }
  }

  console.log(`\nLayout indexing completed successfully.`)
  db.close()
  process.exit(0)
}

run().catch((err) => {
  console.error('Fatal error:', err)
  db.close()
  process.exit(1)
})
