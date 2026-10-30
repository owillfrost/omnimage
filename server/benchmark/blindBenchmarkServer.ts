import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { BlindBenchmarkEngine, BlindEvaluationPool, EvaluationJudgment } from './blindBenchmarkEngine'
import { curateBenchmarkAnchors } from './anchorCurator'
import { handleMediaStream } from '../media/mediaStreamServer'

export function createBlindBenchmarkServer(port = 42500) {
  const engine = new BlindBenchmarkEngine()
  let pools: BlindEvaluationPool[] = []
  let anchors = curateBenchmarkAnchors()

  try {
    pools = anchors.map((a) => engine.buildBlindPool(a))
  } catch (err) {
    console.warn('[BenchmarkServer] Warning while pre-building pools:', err)
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://localhost:${port}`)
      const pathname = url.pathname

      // 1. GET /api/catalog/media - Proxy media stream
      if (pathname === '/api/catalog/media') {
        const library = url.searchParams.get('library') || 'design'
        const id = url.searchParams.get('id') || ''
        const type = (url.searchParams.get('type') || 'thumb') as 'thumb' | 'full'
        await handleMediaStream(req, res, library, id, type)
        return
      }

      // 2. GET /api/benchmark/pools - Returns the masked blind pools
      if (pathname === '/api/benchmark/pools') {
        if (pools.length === 0) {
          anchors = curateBenchmarkAnchors()
          pools = anchors.map((a) => engine.buildBlindPool(a))
        }

        const masked = pools.map((p, idx) => ({
          index: idx,
          total: pools.length,
          anchor: p.anchor,
          candidates: p.candidates,
        }))

        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ status: 'success', pools: masked }))
        return
      }

      // 3. POST /api/benchmark/submit - Evaluates user judgments
      if (pathname === '/api/benchmark/submit' && req.method === 'POST') {
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk)
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
        const judgments = (body.judgments || []) as EvaluationJudgment[]

        const report = engine.evaluateJudgments(pools, judgments)
        const markdown = engine.formatReportMarkdown(report)

        // Save report to docs
        const docsDir = path.resolve(process.cwd(), 'docs')
        if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true })
        fs.writeFileSync(path.join(docsDir, 'layout-blind-benchmark-results.md'), markdown, 'utf-8')

        // Save json state
        const stateDir = path.resolve(process.cwd(), '.omnimage', 'benchmark')
        if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true })
        fs.writeFileSync(path.join(stateDir, 'latest-benchmark.json'), JSON.stringify(report, null, 2), 'utf-8')

        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ status: 'success', report, markdown }))
        return
      }

      // 4. GET / - Serves the modern Interactive Blind Benchmark UI
      if (pathname === '/' || pathname === '/index.html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(renderBlindBenchmarkHtml(port))
        return
      }

      res.statusCode = 404
      res.end('Not Found')
    } catch (err: any) {
      console.error('[BenchmarkServer Error]:', err)
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ status: 'error', error: err?.message || String(err) }))
      }
    }
  })

  return { server, engine, port }
}

function renderBlindBenchmarkHtml(port: number): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark h-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Omnimage — Blind Layout Benchmark</title>
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  <style>
    body {
      background-color: #09090b;
      color: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    .card-selected {
      ring-width: 2px;
      ring-color: #10b981;
      border-color: #10b981 !important;
    }
  </style>
</head>
<body class="min-h-full flex flex-col antialiased selection:bg-zinc-800 selection:text-white">

  <!-- Top Progress Bar -->
  <div class="w-full bg-zinc-900 h-1">
    <div id="progress-line" class="bg-zinc-100 h-1 transition-[width] duration-200" style="width: 0%;"></div>
  </div>

  <!-- Header -->
  <header class="border-b border-zinc-800/80 px-6 py-4 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2 font-mono text-xs text-zinc-400">
        <span class="text-zinc-100 font-semibold tracking-tight">OMNIMAGE</span>
        <span class="text-zinc-600">/</span>
        <span>LAYOUT BENCHMARK</span>
      </div>
      <span class="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
        BLIND EVALUATION
      </span>
    </div>

    <div class="flex items-center gap-4 text-xs font-mono">
      <div class="flex items-center gap-2 text-zinc-400">
        <span>ANCHOR</span>
        <span id="progress-text" class="text-zinc-100 font-bold tabular-nums">01 / 25</span>
      </div>
      <div class="w-px h-3.5 bg-zinc-800"></div>
      <div class="flex items-center gap-1.5 text-zinc-400">
        <span>SELECTED</span>
        <span id="selected-counter" class="text-emerald-400 font-bold tabular-nums">0</span>
      </div>
    </div>
  </header>

  <!-- Evaluation Workspace -->
  <main id="app-view" class="flex-1 flex flex-col p-6 max-w-[1700px] w-full mx-auto">
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
      
      <!-- Left Column: Anchor & Technical Metadata -->
      <aside class="lg:col-span-3 flex flex-col gap-5 self-start sticky top-6">
        <div class="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-mono uppercase tracking-wider text-zinc-400">Anchor Reference</span>
            <span id="anchor-category" class="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/60">
              --
            </span>
          </div>

          <!-- Anchor Media Container -->
          <div class="w-full min-h-[160px] max-h-[380px] rounded-lg overflow-hidden bg-black/80 border border-zinc-800/80 flex items-center justify-center p-2">
            <img id="anchor-img" src="" alt="Anchor Reference" class="w-full max-h-[360px] h-auto object-contain rounded" />
          </div>

          <!-- Title & Context -->
          <div class="flex flex-col gap-1">
            <h2 id="anchor-title" class="font-medium text-zinc-100 text-sm truncate">--</h2>
            <p id="anchor-desc" class="text-xs text-zinc-400 leading-relaxed">--</p>
          </div>

          <!-- Technical Specs -->
          <div class="border-t border-zinc-800/80 pt-3 grid grid-cols-2 gap-2 text-[11px] font-mono text-zinc-400">
            <div>
              <span class="text-zinc-500 block text-[10px]">LIBRARY</span>
              <span id="anchor-lib" class="text-zinc-200">--</span>
            </div>
            <div>
              <span class="text-zinc-500 block text-[10px]">ASPECT RATIO</span>
              <span id="anchor-aspect" class="text-zinc-200">--</span>
            </div>
          </div>
        </div>

        <!-- Keyboard Controls Reference -->
        <div class="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-3.5 text-xs text-zinc-400 flex flex-col gap-2">
          <span class="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Keyboard Controls</span>
          <div class="flex items-center justify-between text-[11px]">
            <span>Next Anchor</span>
            <kbd class="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700/70 rounded text-[10px] font-mono text-zinc-300">Enter</kbd>
          </div>
          <div class="flex items-center justify-between text-[11px]">
            <span>Previous Anchor</span>
            <kbd class="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700/70 rounded text-[10px] font-mono text-zinc-300">Shift + Enter</kbd>
          </div>
        </div>
      </aside>

      <!-- Right Column: Candidate Pool (Masonry without crop) -->
      <section class="lg:col-span-9 flex flex-col gap-5">
        <div class="flex items-center justify-between text-xs text-zinc-400 border-b border-zinc-800/60 pb-3">
          <div class="flex items-center gap-2">
            <span>Candidates Pool</span>
            <span class="text-zinc-600">·</span>
            <span id="candidate-count" class="font-mono text-zinc-300">0</span>
            <span class="text-zinc-500">items randomized</span>
          </div>
          <span class="text-zinc-500">Click items with identical or equivalent spatial wireframe</span>
        </div>

        <!-- Masonry Grid with natural image heights -->
        <div id="candidates-grid" class="columns-2 sm:columns-3 xl:columns-4 gap-3">
          <!-- Cards injected dynamically -->
        </div>

        <!-- Navigation Footer -->
        <div class="flex items-center justify-between border-t border-zinc-800/80 pt-5 mt-auto">
          <button id="btn-prev" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs font-medium text-zinc-300 transition-colors duration-150 disabled:opacity-30 disabled:pointer-events-none cursor-pointer">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
            <span>Previous</span>
          </button>

          <button id="btn-next" class="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-semibold shadow-sm transition-colors duration-150 cursor-pointer">
            <span id="btn-next-label">Next Anchor</span>
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      </section>

    </div>
  </main>

  <!-- Results Screen (Unmasked) -->
  <div id="results-view" class="hidden flex-1 flex flex-col p-8 max-w-5xl w-full mx-auto gap-8">
    <div class="border-b border-zinc-800 pb-5">
      <div class="text-xs font-mono text-emerald-400 uppercase tracking-wider">Benchmark Completed</div>
      <h2 class="text-2xl font-bold text-zinc-100 tracking-tight mt-1">Unmasked Performance Report</h2>
      <p class="text-xs text-zinc-400 mt-1">Direct precision measurements computed across your blind composition judgments.</p>
    </div>

    <div id="results-content" class="space-y-6">
      <!-- Injected Results -->
    </div>
  </div>

  <script>
    let pools = [];
    let currentIdx = 0;
    const judgments = {}; // anchorId -> Set of candidateIds

    async function init() {
      try {
        const res = await fetch('/api/benchmark/pools');
        const data = await res.json();
        pools = data.pools || [];
        if (pools.length === 0) {
          document.getElementById('progress-text').innerText = '00 / 00';
          return;
        }
        renderCurrentPool();
      } catch (err) {
        console.error('Failed to load benchmark pools:', err);
      }
    }

    function renderCurrentPool() {
      const p = pools[currentIdx];
      const anchor = p.anchor;
      if (!judgments[anchor.id]) {
        judgments[anchor.id] = new Set();
      }

      const curNum = String(currentIdx + 1).padStart(2, '0');
      const totalNum = String(pools.length).padStart(2, '0');
      document.getElementById('progress-text').innerText = curNum + ' / ' + totalNum;
      document.getElementById('progress-line').style.width = ((currentIdx / Math.max(1, pools.length - 1)) * 100) + '%';

      document.getElementById('anchor-img').src = '/api/catalog/media?library=' + anchor.libraryId + '&id=' + anchor.id + '&type=thumb';
      document.getElementById('anchor-title').innerText = anchor.title;
      document.getElementById('anchor-desc').innerText = anchor.description;
      document.getElementById('anchor-category').innerText = anchor.categoryLabel;
      document.getElementById('anchor-lib').innerText = anchor.libraryId;
      document.getElementById('anchor-aspect').innerText = anchor.aspectRatio.toFixed(2);
      document.getElementById('candidate-count').innerText = p.candidates.length;

      document.getElementById('btn-prev').disabled = currentIdx === 0;
      const isLast = currentIdx === pools.length - 1;
      document.getElementById('btn-next-label').innerText = isLast ? 'Finish Benchmark' : 'Next Anchor';

      const grid = document.getElementById('candidates-grid');
      grid.innerHTML = '';

      p.candidates.forEach((cand) => {
        const isSelected = judgments[anchor.id].has(cand.id);
        const card = document.createElement('div');
        card.className = 'mb-3 break-inside-avoid relative bg-zinc-900/60 rounded-lg overflow-hidden border transition-colors duration-150 cursor-pointer ' + 
          (isSelected ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-zinc-800/80 hover:border-zinc-600');
        
        card.onclick = () => toggleSelect(cand.id, card);

        card.innerHTML = \`
          <img src="\${cand.thumbUrl}" loading="lazy" class="w-full h-auto block object-contain select-none" />
          <div class="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-150 \${isSelected ? 'bg-emerald-500 text-black' : 'bg-black/60 border border-zinc-600 text-transparent'}">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
          </div>
        \`;
        grid.appendChild(card);
      });

      updateSelectedCount();
    }

    function toggleSelect(candidateId, cardEl) {
      const anchorId = pools[currentIdx].anchor.id;
      const set = judgments[anchorId];
      const checkEl = cardEl.querySelector('.absolute.top-2.right-2');

      if (set.has(candidateId)) {
        set.delete(candidateId);
        cardEl.className = 'mb-3 break-inside-avoid relative bg-zinc-900/60 rounded-lg overflow-hidden border border-zinc-800/80 hover:border-zinc-600 transition-colors duration-150 cursor-pointer';
        checkEl.className = 'absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-150 bg-black/60 border border-zinc-600 text-transparent';
      } else {
        set.add(candidateId);
        cardEl.className = 'mb-3 break-inside-avoid relative bg-zinc-900/60 rounded-lg overflow-hidden border border-emerald-500 ring-1 ring-emerald-500 transition-colors duration-150 cursor-pointer';
        checkEl.className = 'absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-150 bg-emerald-500 text-black';
      }
      updateSelectedCount();
    }

    function updateSelectedCount() {
      const anchorId = pools[currentIdx].anchor.id;
      const count = judgments[anchorId] ? judgments[anchorId].size : 0;
      document.getElementById('selected-counter').innerText = count;
    }

    function handleNext() {
      if (currentIdx < pools.length - 1) {
        currentIdx++;
        renderCurrentPool();
      } else {
        submitResults();
      }
    }

    function handlePrev() {
      if (currentIdx > 0) {
        currentIdx--;
        renderCurrentPool();
      }
    }

    document.getElementById('btn-prev').onclick = handlePrev;
    document.getElementById('btn-next').onclick = handleNext;

    // Keyboard Navigation
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          handlePrev();
        } else {
          handleNext();
        }
      }
    });

    async function submitResults() {
      const btn = document.getElementById('btn-next');
      btn.disabled = true;
      document.getElementById('btn-next-label').innerText = 'Evaluating...';

      const payload = {
        judgments: Object.entries(judgments).map(([anchorId, set]) => ({
          anchorId,
          selectedCandidateIds: Array.from(set),
        })),
      };

      const res = await fetch('/api/benchmark/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      displayReport(data.report, data.markdown);
    }

    function displayReport(report, markdown) {
      document.getElementById('app-view').classList.add('hidden');
      const resultsView = document.getElementById('results-view');
      resultsView.classList.remove('hidden');

      const pV2 = (report.conditions.v2.precisionAt10 * 100).toFixed(1);
      const pV1 = (report.conditions.v1.precisionAt10 * 100).toFixed(1);
      const pClip = (report.conditions.clip.precisionAt10 * 100).toFixed(1);
      const pRand = (report.conditions.random.precisionAt10 * 100).toFixed(1);

      let html = \`
        <!-- Metrics Summary Grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
          <div class="bg-zinc-900 border border-emerald-500/50 p-4 rounded-lg flex flex-col justify-between">
            <span class="text-[11px] text-zinc-400">LAYOUT V2</span>
            <span class="text-3xl font-bold text-emerald-400 my-1">\${pV2}%</span>
            <span class="text-[10px] text-zinc-500">\${report.conditions.v2.totalRelevant} / \${report.conditions.v2.totalProposed} hits</span>
          </div>

          <div class="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col justify-between">
            <span class="text-[11px] text-zinc-400">LAYOUT V1</span>
            <span class="text-3xl font-bold text-zinc-100 my-1">\${pV1}%</span>
            <span class="text-[10px] text-zinc-500">\${report.conditions.v1.totalRelevant} / \${report.conditions.v1.totalProposed} hits</span>
          </div>

          <div class="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col justify-between">
            <span class="text-[11px] text-zinc-400">CLIP SEMANTIC</span>
            <span class="text-3xl font-bold text-zinc-300 my-1">\${pClip}%</span>
            <span class="text-[10px] text-zinc-500">\${report.conditions.clip.totalRelevant} / \${report.conditions.clip.totalProposed} hits</span>
          </div>

          <div class="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col justify-between">
            <span class="text-[11px] text-zinc-400">RANDOM FLOOR</span>
            <span class="text-3xl font-bold text-zinc-500 my-1">\${pRand}%</span>
            <span class="text-[10px] text-zinc-500">\${report.conditions.random.totalRelevant} / \${report.conditions.random.totalProposed} hits</span>
          </div>
        </div>

        <!-- Pairwise Results -->
        <div class="bg-zinc-900/60 border border-zinc-800 p-4 rounded-lg flex items-center justify-between text-xs font-mono">
          <span class="text-zinc-400">HEAD-TO-HEAD MATCH (V2 VS V1)</span>
          <div class="flex items-center gap-4">
            <span class="text-emerald-400 font-semibold">V2 WON: \${report.pairwiseV1vsV2.v2Won}</span>
            <span class="text-zinc-400">TIED: \${report.pairwiseV1vsV2.tied}</span>
            <span class="text-rose-400">V1 WON: \${report.pairwiseV1vsV2.v1Won}</span>
          </div>
        </div>

        <!-- Category Breakdown -->
        <div class="border border-zinc-800 rounded-lg overflow-hidden">
          <table class="w-full text-left text-xs">
            <thead class="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-mono text-[11px]">
              <tr>
                <th class="py-2.5 px-4">CATEGORY</th>
                <th class="py-2.5 px-4 text-center">ANCHORS</th>
                <th class="py-2.5 px-4 text-right">LAYOUT V2</th>
                <th class="py-2.5 px-4 text-right">LAYOUT V1</th>
                <th class="py-2.5 px-4 text-right">CLIP</th>
                <th class="py-2.5 px-4 text-right">RANDOM</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-800/60 font-mono text-[11px]">
      \`;

      for (const [key, c] of Object.entries(report.categoryBreakdown)) {
        if (c.count === 0) continue;
        html += \`
          <tr class="hover:bg-zinc-900/30">
            <td class="py-3 px-4 font-sans text-zinc-200">\${c.categoryLabel}</td>
            <td class="py-3 px-4 text-center text-zinc-400">\${c.count}</td>
            <td class="py-3 px-4 text-right font-bold text-emerald-400">\${(c.v2Precision * 100).toFixed(1)}%</td>
            <td class="py-3 px-4 text-right text-zinc-300">\${(c.v1Precision * 100).toFixed(1)}%</td>
            <td class="py-3 px-4 text-right text-zinc-400">\${(c.clipPrecision * 100).toFixed(1)}%</td>
            <td class="py-3 px-4 text-right text-zinc-500">\${(c.randomPrecision * 100).toFixed(1)}%</td>
          </tr>
        \`;
      }

      html += \`
            </tbody>
          </table>
        </div>

        <!-- Markdown Output Box -->
        <div class="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 flex flex-col gap-2">
          <div class="flex items-center justify-between text-xs text-zinc-400">
            <span class="font-mono text-[11px]">SAVED TO docs/layout-blind-benchmark-results.md</span>
            <button onclick="navigator.clipboard.writeText(decodeURIComponent('\${encodeURIComponent(markdown)}'))" class="text-xs px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-mono transition-colors cursor-pointer">
              Copy Markdown
            </button>
          </div>
          <pre class="bg-black/70 p-3 rounded text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-60 leading-relaxed">\${markdown}</pre>
        </div>
      \`;

      document.getElementById('results-content').innerHTML = html;
    }

    init();
  </script>
</body>
</html>`;
}
