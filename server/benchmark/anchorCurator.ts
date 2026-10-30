import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { AnchorDef } from './blindBenchmarkEngine'
import { parseLayoutBinary } from '../../src/contracts/binaryFormats'

/**
 * Curates a deterministic, balanced set of 20 to 25 benchmark anchors
 * covering the 5 critical edge-case categories from real indexed libraries.
 */
export function curateBenchmarkAnchors(dbPath = path.resolve('.omnimage', 'catalog.sqlite')): AnchorDef[] {
  const db = new Database(dbPath, { readonly: true })

  const anchors: AnchorDef[] = []

  // Load layout vectors to measure energy profiles
  const v1DesignPath = path.resolve('.omnimage', 'layout', 'layout-design.v1.bin')
  const v2DesignPath = path.resolve('.omnimage', 'layout', 'layout-design.v2.bin')

  const parsedV1Design = fs.existsSync(v1DesignPath)
    ? parseLayoutBinary(fs.readFileSync(v1DesignPath).buffer)
    : null
  const parsedV2Design = fs.existsSync(v2DesignPath)
    ? parseLayoutBinary(fs.readFileSync(v2DesignPath).buffer)
    : null

  // Helper to compute vector norm/energy
  const getVectorEnergy = (vecs: Uint8Array, idx: number, dim = 288) => {
    let sum = 0
    const offset = idx * dim
    for (let d = 0; d < dim; d++) {
      sum += vecs[offset + d]
    }
    return sum
  }

  // 1. Full-bleed Photos / Rich Prompts (from google-flow: landscape/art with edge-to-edge content)
  const gfRows = db
    .prepare(
      `SELECT id, name, width, height, tags_json FROM items 
       WHERE library_id = 'google-flow' AND is_deleted = 0 AND width >= 500 AND height >= 300 
       ORDER BY rowid ASC LIMIT 100`
    )
    .all() as Array<{ id: string; name: string; width: number; height: number; tags_json: string }>

  let fullBleedCount = 0
  for (const row of gfRows) {
    if (fullBleedCount >= 5) break
    const aspect = row.width / Math.max(1, row.height)
    anchors.push({
      id: row.id,
      libraryId: 'google-flow',
      title: row.name || `Photo Art ${fullBleedCount + 1}`,
      category: 'full_bleed_photo',
      categoryLabel: 'Full-bleed Photo / Scene',
      description: 'Edge-to-edge scene without solid borders; tests fallback to global median vs perimeter variance',
      aspectRatio: aspect,
    })
    fullBleedCount++
  }

  // 2. Minimal / Flat Images (low energy in design: logos, icons, clean wireframes)
  if (parsedV2Design) {
    const v2Map = new Map<string, number>()
    parsedV2Design.ids.forEach((id, i) => v2Map.set(id, i))

    const designMinimalRows = db
      .prepare(
        `SELECT id, name, width, height FROM items 
         WHERE library_id = 'design' AND is_deleted = 0 AND (name LIKE '%icon%' OR name LIKE '%logo%' OR name LIKE '%clean%' OR name LIKE '%empty%' OR name LIKE '%minimal%' OR name LIKE '%wireframe%')
         LIMIT 50`
      )
      .all() as Array<{ id: string; name: string; width: number; height: number }>

    let minCount = 0
    for (const row of designMinimalRows) {
      if (minCount >= 5) break
      const idx = v2Map.get(row.id)
      if (idx !== undefined) {
        const energy = getVectorEnergy(parsedV2Design.vectors, idx)
        // Choose items with low-to-moderate energy
        if (energy > 30000) continue
        anchors.push({
          id: row.id,
          libraryId: 'design',
          title: row.name || `Minimal Asset ${minCount + 1}`,
          category: 'minimal_flat',
          categoryLabel: 'Minimal / Flat Asset',
          description: 'High background proportion with minimal graphic energy; tests noise floor floor/clamping',
          aspectRatio: row.width / Math.max(1, row.height),
        })
        minCount++
      }
    }

    // Fallback if not enough named minimal assets
    if (minCount < 5) {
      const anyRows = db
        .prepare(`SELECT id, name, width, height FROM items WHERE library_id = 'design' AND is_deleted = 0 LIMIT 200`)
        .all() as Array<{ id: string; name: string; width: number; height: number }>
      for (const row of anyRows) {
        if (minCount >= 5) break
        if (anchors.some((a) => a.id === row.id)) continue
        const idx = v2Map.get(row.id)
        if (idx !== undefined) {
          const energy = getVectorEnergy(parsedV2Design.vectors, idx)
          if (energy < 15000) {
            anchors.push({
              id: row.id,
              libraryId: 'design',
              title: row.name || `Flat image ${minCount + 1}`,
              category: 'minimal_flat',
              categoryLabel: 'Minimal / Flat Asset',
              description: 'High background proportion with minimal graphic energy; tests noise floor floor/clamping',
              aspectRatio: row.width / Math.max(1, row.height),
            })
            minCount++
          }
        }
      }
    }
  }

  // 3. Isoluminant Edge Cases (strong chromatic difference vs luminance)
  // Find items where v2 registers significantly higher edge energy than v1
  if (parsedV1Design && parsedV2Design) {
    const v1Map = new Map<string, number>()
    const v2Map = new Map<string, number>()
    parsedV1Design.ids.forEach((id, i) => v1Map.set(id, i))
    parsedV2Design.ids.forEach((id, i) => v2Map.set(id, i))

    const candRows = db
      .prepare(
        `SELECT id, name, width, height FROM items 
         WHERE library_id = 'design' AND is_deleted = 0 
         ORDER BY rowid DESC LIMIT 400`
      )
      .all() as Array<{ id: string; name: string; width: number; height: number }>

    let isoCount = 0
    for (const row of candRows) {
      if (isoCount >= 5) break
      if (anchors.some((a) => a.id === row.id)) continue
      const idx1 = v1Map.get(row.id)
      const idx2 = v2Map.get(row.id)
      if (idx1 !== undefined && idx2 !== undefined) {
        const e1 = getVectorEnergy(parsedV1Design.vectors, idx1)
        const e2 = getVectorEnergy(parsedV2Design.vectors, idx2)
        // If v2 captures noticeably more perceptual energy than v1 grayscale
        if (e2 > e1 * 1.35 && e1 > 5000) {
          anchors.push({
            id: row.id,
            libraryId: 'design',
            title: row.name || `Chromatic UI ${isoCount + 1}`,
            category: 'isoluminant_edge',
            categoryLabel: 'Isoluminant Color Boundaries',
            description: 'Colored components on matching luminance backgrounds where RGB Sobel outperforms Grayscale Sobel',
            aspectRatio: row.width / Math.max(1, row.height),
          })
          isoCount++
        }
      }
    }
  }

  // 4. Dense Texture / Clutter (Bento grids, dashboard widgets, complex layouts)
  const denseRows = db
    .prepare(
      `SELECT id, name, width, height FROM items 
       WHERE library_id = 'design' AND is_deleted = 0 
       AND (name LIKE '%bento%' OR name LIKE '%dashboard%' OR name LIKE '%grid%' OR name LIKE '%table%' OR name LIKE '%card%' OR name LIKE '%analytics%')
       LIMIT 30`
    )
    .all() as Array<{ id: string; name: string; width: number; height: number }>

  let denseCount = 0
  for (const row of denseRows) {
    if (denseCount >= 5) break
    if (anchors.some((a) => a.id === row.id)) continue
    anchors.push({
      id: row.id,
      libraryId: 'design',
      title: row.name || `Dense Dashboard ${denseCount + 1}`,
      category: 'dense_texture',
      categoryLabel: 'Dense Texture / Bento Clutter',
      description: 'Multiple dense modular widgets, columns or bento cards; tests spatial blur robustness',
      aspectRatio: row.width / Math.max(1, row.height),
    })
    denseCount++
  }

  // 5. Dark / Light UI Pairs (classic landing pages with split-screen, hero or columns)
  const uiRows = db
    .prepare(
      `SELECT id, name, width, height FROM items 
       WHERE library_id = 'design' AND is_deleted = 0 
       AND (name LIKE '%landing%' OR name LIKE '%hero%' OR name LIKE '%split%' OR name LIKE '%pricing%' OR name LIKE '%web%' OR name LIKE '%page%')
       LIMIT 40`
    )
    .all() as Array<{ id: string; name: string; width: number; height: number }>

  let uiCount = 0
  for (const row of uiRows) {
    if (uiCount >= 5) break
    if (anchors.some((a) => a.id === row.id)) continue
    anchors.push({
      id: row.id,
      libraryId: 'design',
      title: row.name || `UI Layout ${uiCount + 1}`,
      category: 'dark_light_wireframe',
      categoryLabel: 'Dark/Light Wireframe Structure',
      description: 'Clear structural wireframe (split-screen, centered hero, header + content); tests theme invariance',
      aspectRatio: row.width / Math.max(1, row.height),
    })
    uiCount++
  }

  db.close()
  return anchors
}
