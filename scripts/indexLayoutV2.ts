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
  console.log(`  Omnimage Layout v2 Indexer (Redmean + RGB Sobel 288D) `)
  console.log(`======================================================\n`)

  for (const lib of selectedLibs) {
    console.log(`\nTarget Library: [${lib.id}] (${lib.name})`)
    const binPath = resolveLayoutFilePath(lib.id, 'v2')
    const exists = fs.existsSync(binPath)
    console.log(`Target binary: ${binPath} (Status: ${exists ? 'Existing v2 file' : 'New v2 file'})`)

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
        extractorVersion: 2,
        targetFilePath: binPath,
      })
      clearInterval(progressTimer)

      console.log(`Done [${lib.id}] in ${result.elapsedSec}s:`)
      console.log(`  - Total items: ${result.total}`)
      console.log(`  - Newly indexed (v2): ${result.newlyIndexed}`)
      console.log(`  - Reused existing (v2): ${result.existing}`)
    } catch (err) {
      clearInterval(progressTimer)
      console.error(`Error during layout v2 indexing of [${lib.id}]:`, err)
    }
  }

  console.log(`\nLayout v2 indexing batch completed.`)
  db.close()
  process.exit(0)
}

run().catch((err) => {
  console.error('Fatal error in layout v2 indexer:', err)
  db.close()
  process.exit(1)
})
