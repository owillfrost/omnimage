import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { BlindBenchmarkEngine } from '../../server/benchmark/blindBenchmarkEngine'
import { curateBenchmarkAnchors } from '../../server/benchmark/anchorCurator'

describe('Blind Benchmark Engine & Curation Tests', () => {
  let engine: BlindBenchmarkEngine

  beforeAll(() => {
    engine = new BlindBenchmarkEngine()
  })

  afterAll(() => {
    engine.close()
  })

  it('curates a balanced set of anchors covering all 5 critical edge-case categories', () => {
    const anchors = curateBenchmarkAnchors()
    expect(anchors.length).toBeGreaterThanOrEqual(15)

    const categories = new Set(anchors.map((a) => a.category))
    expect(categories.has('full_bleed_photo')).toBe(true)
    expect(categories.has('minimal_flat')).toBe(true)
    expect(categories.has('isoluminant_edge')).toBe(true)
    expect(categories.has('dense_texture')).toBe(true)
    expect(categories.has('dark_light_wireframe')).toBe(true)
  })

  it('builds a randomized masked evaluation pool with 4 conditions (v1, v2, CLIP, Random)', () => {
    const anchors = curateBenchmarkAnchors()
    const anchor = anchors[0]

    const pool = engine.buildBlindPool(anchor)

    expect(pool.anchor.id).toBe(anchor.id)
    expect(pool.candidates.length).toBeGreaterThanOrEqual(10)

    // Verify conditions are represented in contributions
    const allConditions = new Set<string>()
    for (const conds of Object.values(pool.contributions)) {
      conds.forEach((c) => allConditions.add(c))
    }

    expect(allConditions.has('v1')).toBe(true)
    expect(allConditions.has('v2')).toBe(true)
    expect(allConditions.has('clip')).toBe(true)
    expect(allConditions.has('random')).toBe(true)

    // Ensure anchor does not include itself
    expect(pool.candidates.some((c) => c.id === anchor.id)).toBe(false)
  })

  it('evaluates judgments and computes Precision@10, pairwise results, and category breakdown', () => {
    const anchors = curateBenchmarkAnchors().slice(0, 3)
    const pools = anchors.map((a) => engine.buildBlindPool(a))

    // Simulate judgments: mark first candidate of each pool as relevant
    const judgments = pools.map((p) => ({
      anchorId: p.anchor.id,
      selectedCandidateIds: [p.candidates[0].id],
    }))

    const report = engine.evaluateJudgments(pools, judgments)

    expect(report.totalAnchors).toBe(3)
    expect(report.conditions.v1).toBeDefined()
    expect(report.conditions.v2).toBeDefined()
    expect(report.conditions.clip).toBeDefined()
    expect(report.conditions.random).toBeDefined()
    expect(report.pairwiseV1vsV2.detail.length).toBe(3)

    const markdown = engine.formatReportMarkdown(report)
    expect(markdown).toContain('# Blind Layout Benchmark Evaluation Report')
    expect(markdown).toContain('Layout v2')
    expect(markdown).toContain('Layout v1')
    expect(markdown).toContain('CLIP ViT-B/32')
  })
})
