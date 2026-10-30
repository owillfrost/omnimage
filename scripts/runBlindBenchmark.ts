import { createBlindBenchmarkServer } from '../server/benchmark/blindBenchmarkServer'

const port = Number(process.env.BENCHMARK_PORT || 42500)

const { server } = createBlindBenchmarkServer(port)

server.listen(port, () => {
  console.log(`\n================================================================`)
  console.log(`  Omnimage Blind Layout Benchmark Tool (v1 vs v2 vs CLIP vs Rand)`)
  console.log(`================================================================`)
  console.log(`  Access the interactive visual benchmark at:`)
  console.log(`  -> http://localhost:${port}`)
  console.log(`\n  Features:`)
  console.log(`  - 100% full library search across design & google-flow`)
  console.log(`  - 4 conditions randomized and masked (Fisher-Yates)`)
  console.log(`  - Curated anchors for all 5 difficult edge cases`)
  console.log(`  - Real-time unmasked head-to-head precision report`)
  console.log(`  - Markdown output saved to docs/layout-blind-benchmark-results.md`)
  console.log(`================================================================\n`)
})
