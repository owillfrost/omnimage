import type Database from 'better-sqlite3'

export function runMigrations(db: Database.Database): void {
  // Table: libraries
  db.exec(`
    CREATE TABLE IF NOT EXISTS libraries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL,
      source_folder_path TEXT,
      source_type TEXT NOT NULL,
      item_count INTEGER DEFAULT 0,
      indexed_embedding_count INTEGER DEFAULT 0,
      is_hidden INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  // Safe schema evolution for existing databases
  try {
    db.exec(`ALTER TABLE libraries ADD COLUMN is_hidden INTEGER DEFAULT 0;`)
  } catch {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE libraries ADD COLUMN source_folder_path TEXT;`)
  } catch {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE items ADD COLUMN split_toning_json TEXT;`)
  } catch {
    // Column already exists
  }

  // Table: items (compact metadata for grid rendering)
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      library_id TEXT NOT NULL,
      id TEXT NOT NULL,
      content_hash TEXT,
      name TEXT NOT NULL,
      ext TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      duration REAL,
      btime INTEGER,
      mtime INTEGER,
      dominant_color TEXT,
      palette_json TEXT,
      split_toning_json TEXT,
      tags_json TEXT,
      folders_json TEXT,
      url TEXT,
      has_annotation INTEGER DEFAULT 0,
      compact_json TEXT NOT NULL,
      media_rel_path TEXT NOT NULL,
      thumb_rel_path TEXT,
      is_deleted INTEGER DEFAULT 0,
      PRIMARY KEY (library_id, id)
    );

    CREATE INDEX IF NOT EXISTS idx_items_library ON items(library_id, is_deleted);
    CREATE INDEX IF NOT EXISTS idx_items_hash ON items(content_hash);
  `)

  // Table: item_details (heavy metadata loaded on demand)
  db.exec(`
    CREATE TABLE IF NOT EXISTS item_details (
      library_id TEXT NOT NULL,
      id TEXT NOT NULL,
      annotation TEXT,
      raw_meta_json TEXT,
      PRIMARY KEY (library_id, id)
    );
  `)

  // Virtual Table: items_fts (FTS5 full-text index on prompts, names, and tags)
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
      library_id,
      id UNINDEXED,
      name,
      tags_text,
      annotation,
      tokenize='unicode61 remove_diacritics 2'
    );
  `)
}
