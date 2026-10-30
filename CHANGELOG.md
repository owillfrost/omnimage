# Changelog

All notable changes to **Omnimage** are documented here.

---

## [Unreleased] - 2026-10-29

### New: Layout mode (Spatial Composition & Wireframe Search)
A new similarity search dimension next to Mixed, AI Aesthetic, Palette, and Grade. Group and search visual references by **spatial wireframe structure and framing**, completely decoupled from color palette.

- **Dual-Channel 288D Spatial Grid:** $16 \times 9$ canonical grid storing foreground contrast mass (Redmean $\Delta C$) and multi-channel RGB Sobel edges with soft noise suppression.
- **Dark/Light Mode Invariance:** Computes visual mass relative to each image's adaptive background, matching light and dark themes of identical layouts at $\ge 99.5\%$.
- **Full-Bleed Scene Detection:** Continuous 1px perimeter sampling with variance-triggered fallback to global image median.
- **Dedicated External Storage:** Stored in `.omnimage/layout/layout-${libraryId}.bin` outside SQLite with versioned headers and ETag/gzip streaming (~11 MB for 36,000+ items).
- **Sub-10ms Off-Thread Ranking:** Radial sorting and distance mapping performed entirely in the Web Worker.
- **Live Search Controls:** Aspect Ratio Cohesion slider and Layout Sensitivity curve in `FloatingInfoCard`.
- **Mirror Tolerance Support:** Optional horizontal flip matching for photography and artistic framing.

---

## [0.2.0] - 2026-10-27

### New: Grade mode
A new similarity mode, next to Mixed, AI Aesthetic and Palette. Pick an anchor image and find images with a similar color grade: the tint in the shadows and in the highlights, not just the overall palette.

- Shadows are compared with shadows, highlights with highlights, so looks like teal & orange can be told apart from the reverse.
- Pure blacks, blown-out whites and near-neutral pixels are ignored, so things like letterbox bars don’t wash out the result.
- Works best with anchors that have a clear grade. With a very neutral anchor, it will favor other neutral images.

### Upgrading
This update adds a new column to the library database, and existing images are analyzed in batches from their thumbnails. Back up your library before updating.

### Thanks
This came from a great suggestion by @ichelpark.
