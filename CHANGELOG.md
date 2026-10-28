# Changelog

All notable changes to **Omnimage** are documented here.

---

## [Unreleased] - 2026-10-27

### New: Grade mode
A new similarity mode, next to Mixed, AI Aesthetic and Palette. Pick an anchor image and find images with a similar color grade: the tint in the shadows and in the highlights, not just the overall palette.

- Shadows are compared with shadows, highlights with highlights, so looks like teal & orange can be told apart from the reverse.
- Pure blacks, blown-out whites and near-neutral pixels are ignored, so things like letterbox bars don’t wash out the result.
- Works best with anchors that have a clear grade. With a very neutral anchor, it will favor other neutral images.

### Upgrading
This update adds a new column to the library database, and existing images are analyzed in batches from their thumbnails. Back up your library before updating.

### Thanks
This came from a great suggestion by @ichelpark.
