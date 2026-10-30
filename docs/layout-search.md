# Spatial Layout & Composition Search (`Layout Mode`)

Omnimage includes a dedicated **Spatial Layout & Composition Search** dimension alongside semantic visual search (CLIP) and chromatic harmony (CIELAB / Grade Mode).

While CLIP groups images by high-level semantic subject and style, and Color Mode groups images by chromatic palette, **Layout Mode** captures **WHERE elements and visual masses are distributed in 2D space** (the underlying wireframe, visual hierarchy, framing, and column structure).

---

## Key Principles

1. **Decoupled from Color & Theme (Dark/Light Invariance):**
   A split-screen landing page in Dark Mode (white text on black) and a Light Mode equivalent (black text on white) share the exact same structural wireframe. Layout Mode computes visual mass relative to each image's adaptive background, achieving over **99.5% similarity** across identical layouts regardless of color palette.

2. **Zero Bloat & Instant Latency:**
   - Fingerprint size: exactly **288 bytes per item** ($16 \times 9$ grid $\times 2$ channels, quantized to `Uint8`).
   - Disk footprint: ~**11 MB** for an entire catalog of **36,000+ images**.
   - Search latency: **< 10 ms** across 20,000 in-memory layout vectors inside the parallel Web Worker.

3. **Separate Binary Storage Outside SQLite:**
   Vectors are stored in dedicated versioned binary files (`.omnimage/layout/layout-${libraryId}.bin`), keeping SQLite lightweight and avoiding database write-ahead log (WAL) fragmentation.

---

## Mathematical Specification

```text
Input Image (Thumbnail 64x36 / 500x500)
    │
    ├── 1. Adaptive Background Estimation
    │      ├── Continuous 1px perimeter sampling (all edge pixels)
    │      ├── Compute perimeter color variance (std dev σ)
    │      └── If σ > 48 (full-bleed scene) → fallback to global image median
    │          If σ ≤ 48 (framed UI/poster)  → perimeter median (R_bg, G_bg, B_bg)
    │
    ├── 2. Channel 0: Foreground Mass (Redmean ΔC)
    │      └── Per-pixel perceptual color distance to adaptive background
    │          ΔC = sqrt( (2 + r̄/256)ΔR² + 4ΔG² + (2 + (255 - r̄)/256)ΔB² )
    │
    ├── 3. Channel 1: Multi-Channel RGB Sobel Edges
    │      ├── dx = max(|dx_R|, |dx_G|, |dx_B|)
    │      ├── dy = max(|dy_R|, |dy_G|, |dy_B|)
    │      └── Soft noise threshold: max(0, (dx + dy) - 12)
    │
    ├── 4. Soft 3x3 Spatial Pooling Blur
    │      └── Provides ~5% translation tolerance for minor element displacement
    │
    ├── 5. Contrast Floor & Flat Image Protection
    │      └── Thresholds minimum mass and edge energy to avoid noise amplification
    │          Zero-norm vectors for blank/monochrome images with stable cosine handling
    │
    └── 6. Quantization to Uint8 [0..255] per cell channel
           └── Result: 288-byte vector (16 columns × 9 rows × 2 channels)
```

### Distance & Similarity Metrics

The radial sorting metric combines spatial grid similarity with aspect ratio framing:

$$\text{combinedSim} = \text{layoutSim} \cdot (1 - w_{\text{aspect}}) + \text{aspectSim} \cdot w_{\text{aspect}}$$

$$\text{distance} = (1 - \text{combinedSim}) \cdot 85$$

- **Aspect Weight ($w_{\text{aspect}}$)**: Defaults to $0.15$ ($15\%$), adjustable in real time from $0\%$ (pure spatial layout regardless of aspect ratio) to $50\%$ (strict aspect ratio match).
- **Distance Range**: Mapped into the standard Omnimage canvas radial range $[0..85]$, where $0 = 100\%$ match and $85 = 0\%$ match.

### Mirror Tolerance (Horizontal Flip)

For photography and artistic framing, a composition with a subject on the left can optionally be matched against a subject on the right using the horizontal flip operator ($x' = 15 - x$):

$$\text{sim}_{\text{mirror}}(A, B) = \max\Big(\text{sim}(A, B), \; \text{sim}(A, \text{flipH}(B))\Big)$$

---

## Binary File Format Specification

Layout binaries are stored in `.omnimage/layout/layout-${libraryId}.bin`:

```text
[Bytes 0..3]        : Uint32LE -> Header length H in bytes
[Bytes 4..4+H-1]    : UTF-8 JSON -> { "version": 2, "dim": 288, "ids": ["id1", "id2", ...] }
[Bytes 4+H..End]    : Packed Uint8Array -> N × 288 contiguous bytes (offset = i * 288)
```

- **Backwards Compatibility**: The parser automatically recognizes legacy v1 headers (`["id1", "id2"]`) and structured v2 headers (`{ version, dim, ids }`).
- **Network Streaming**: Served via `GET /api/catalog/layout-vectors?library=:lib` with HTTP `ETag` and `Content-Encoding: gzip` (transfer size ~3.8 MB for 23,000 items).

---

## CLI & Indexing Commands

### Index all libraries incrementally:
```bash
npm run migrate:layout
```

### Index a specific library:
```bash
npm run migrate:layout design
npm run migrate:layout google-flow
npm run migrate:layout Comfy
```

The indexer is **atomic and incremental**: existing items are fast-copied in memory, processing newly added items only. Re-running on an up-to-date library finishes in **0.1s**.

---

## Benchmark & Distribution Analysis

Empirical cosine distributions measured over 65,000 random pairs from real production libraries:

| Library | Total Items | 5th Percentile ($p_5$) | Median ($p_{50}$) | 99th Percentile ($p_{99}$) |
|---|---|:---:|:---:|:---:|
| **`design`** (UI / Web) | 22,943 | 0.4366 | 0.7174 | 0.8995 |
| **`google-flow`** (Prompts / Art) | 12,900 | 0.6431 | 0.7976 | 0.9077 |
| **`Comfy`** (AI Generations) | 359 | 0.6153 | 0.7963 | 0.9112 |

Run distribution benchmarks anytime via:
```bash
npx vite-node scripts/benchmarkLayout.ts
```
