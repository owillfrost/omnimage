# Third-Party Notices & Open Source Licenses

This project is 100% Free and Open Source Software (FOSS) licensed under the MIT License.
All third-party libraries, models, and dependencies used adhere strictly to permissive licenses.

---

## 1. Machine Learning Model & Weights

### `Xenova/clip-vit-base-patch32`
- **License:** MIT License
- **Origin:** OpenAI / Hugging Face (ONNX conversion by Xenova)
- **Quantization:** Int8 512-dimensional vector projections ([-127..127])
- **Usage:** In-memory visual query inference and text semantic similarity embeddings.

---

## 2. Core Backend & Database

### `better-sqlite3`
- **License:** MIT License
- **Copyright:** (c) Joshua Wise
- **Underlying Engine:** SQLite (Public Domain)
- **Usage:** Local transactional storage, WAL mode, memory-mapped I/O and FTS5 inverted text index.

### `sharp`
- **License:** Apache License 2.0
- **Copyright:** (c) Lovell Fuller and contributors
- **Underlying Engine:** libvips (LGPL-2.1-or-later)
- **Usage:** High-performance 640px WebP thumbnail resizing and in-memory RGBA color sampling.

### `chokidar`
- **License:** MIT License
- **Copyright:** (c) Paul Miller
- **Usage:** Cross-platform file system watcher for real-time asset ingestion.

### `@huggingface/transformers`
- **License:** Apache License 2.0
- **Copyright:** (c) Hugging Face
- **Usage:** In-process CLIP tokenizer and vision/text projection execution.

---

## 3. Frontend & UI Architecture

### `React` & `React-DOM`
- **License:** MIT License
- **Copyright:** (c) Meta Platforms, Inc.

### `Tailwind CSS`
- **License:** MIT License
- **Copyright:** (c) Tailwind Labs, Inc.

### `Lucide Icons`
- **License:** ISC License
- **Copyright:** (c) Lucide Contributors

### `Radix UI Primitives`
- **License:** MIT License
- **Copyright:** (c) WorkOS

### `Electron`
- **License:** MIT License
- **Copyright:** (c) Electron contributors / OpenJS Foundation

---

## 4. Software Freedom & Independence

- **Zero Unfree Dependencies:** No proprietary binary blobs, no closed-source SDKs.
- **Zero Proprietary App Lock-In:** Operates 100% independently from external proprietary HTTP services and does not use closed protocols.
- **Data Sovereignty:** All metadata, virtual folders, tags, prompts, and embeddings are stored locally in standard open formats (`SQLite` + JSON sidecars in `.omnimage/`).
