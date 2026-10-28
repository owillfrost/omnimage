import path from 'node:path'
import Database from 'better-sqlite3'
import { SplitToningMigrationService } from '../server/db/splitToningMigration.ts'

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

const migrator = new SplitToningMigrationService(db)

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
  console.log(`  Omnimage Split Toning Grade Migration (Dual Vector) `)
  console.log(`======================================================\n`)

  for (const lib of selectedLibs) {
    const countRow = db
      .prepare('SELECT COUNT(*) as count FROM items WHERE library_id = ? AND split_toning_json IS NULL AND is_deleted = 0')
      .get(lib.id) as { count: number } | undefined

    const pendingCount = countRow?.count || 0
    console.log(`\nLibrary: [${lib.id}] (${lib.name})`)
    console.log(`Total catalog items: ${lib.item_count} | Items pending migration: ${pendingCount}`)

    if (pendingCount === 0) {
      console.log(`All items in [${lib.id}] already have split toning indexed!`)
      continue
    }

    console.log(`Starting migration for ${pendingCount} items in [${lib.id}]...`)
    const startTime = Date.now()
    let lastLoggedProcessed = 0

    const progressTimer = setInterval(() => {
      const prog = migrator.getProgress()
      if (prog && prog.processed > lastLoggedProcessed) {
        lastLoggedProcessed = prog.processed
        const pct = ((prog.processed / (prog.totalToMigrate || 1)) * 100).toFixed(1)
        console.log(
          `  -> Progress: ${prog.processed}/${prog.totalToMigrate} (${pct}%) | ` +
          `Thumbs: ${prog.fromThumbnail} | Fallback: ${prog.fromFallback} | Rate: ${prog.ratePerSec.toFixed(0)} items/s`
        )
      }
    }, 2000)

    try {
      const result = await migrator.runMigration(lib.id, {
        batchSize: 250,
      })
      clearInterval(progressTimer)

      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`Done [${lib.id}] in ${elapsedSec}s:`)
      console.log(`  - Processed: ${result.processed}`)
      console.log(`  - Updated in DB: ${result.updated}`)
      console.log(`  - Extracted from Thumbnails: ${result.fromThumb}`)
      console.log(`  - Extracted from Palette Fallback: ${result.fromFallback}`)
    } catch (err) {
      clearInterval(progressTimer)
      console.error(`Error during migration of [${lib.id}]:`, err)
    }
  }

  console.log(`\nMigration run completed. Database updated successfully.`)
  db.close()
}

run().catch((err) => {
  console.error('Fatal error:', err)
  db.close()
  process.exit(1)
})
