import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'

let instance: Database.Database | null = null
let currentDbPath: string | null = null

export function getDatabasePath(customPath?: string): string {
  if (customPath) return customPath
  // Store SQLite database in .omnimage/ directory at the workspace root
  const omnimageDir = path.resolve(process.cwd(), '.omnimage')
  if (!fs.existsSync(omnimageDir)) {
    fs.mkdirSync(omnimageDir, { recursive: true })
  }
  return path.join(omnimageDir, 'catalog.sqlite')
}

/**
 * Initializes and returns the singleton better-sqlite3 database connection
 * configured with high-performance PRAGMAs (WAL mode, memory temp store, 256MB mmap).
 */
export function getSqliteDb(customPath?: string): Database.Database {
  const dbPath = getDatabasePath(customPath)

  if (instance && currentDbPath === dbPath) {
    return instance
  }

  if (instance) {
    try {
      instance.close()
    } catch {
      // ignore
    }
  }

  const db = new Database(dbPath)

  // Configure high-performance SQLite pragmas
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('temp_store = MEMORY')
  db.pragma('mmap_size = 268435456') // 256MB memory-mapped I/O
  db.pragma('cache_size = -64000')   // 64MB page cache
  db.pragma('foreign_keys = ON')

  instance = db
  currentDbPath = dbPath

  return db
}

export function closeSqliteDb(): void {
  if (instance) {
    try {
      instance.close()
    } catch {
      // ignore
    }
    instance = null
    currentDbPath = null
  }
}
