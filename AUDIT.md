# Audit: src

## Surfaces

One row per screen/interface component.

- **A acquisition**: whoever is not a customer yet. Persuade, prove, convert.
- **B work**: whoever uses it every day. Speed, density, keyboard.
- **C trust**: money, permission, destructive action. It cannot lie.

| File | Surface (A/B/C) | Business variable it moves | Notes |
|---|---|---|---|
| src/App.tsx | B | workspace session continuity | Main application container and keyboard shortcut coordinator |
| src/components/ArtworkCard.tsx | B | visual scanning throughput | Canvas artwork tile with dynamic color accents |
| src/components/ArtworkDialog.tsx | B | metadata inspection precision | Detailed artwork inspector dialog |
| src/components/CanvasControls.tsx | B | navigation speed and zoom density | Floating zoom, pan, and layout mode controls |
| src/components/ComparisonSidebar.tsx | B | variant comparison accuracy | Side-by-side prompt and generation parameter diff |
| src/components/CosmosLogo.tsx | B | brand recognition | Clean minimal vector identity |
| src/components/EagleFolderPicker.tsx | B | folder navigation throughput | Eagle library hierarchy tree selector |
| src/components/EagleTaxonomyPopover.tsx | B | tag discovery speed | Tag and folder taxonomy filter popover |
| src/components/ErrorBoundary.tsx | C | crash recovery reliability | Clean failure boundary without blur noise |
| src/components/ExploreFeedView.tsx | B | discovery throughput | Masonry feed with infinite scroll |
| src/components/ExploreFullscreenViewer.tsx | B | full-fidelity inspection | Full-screen viewer stage |
| src/components/FloatingInfoCard.tsx | B | contextual inspection density | Clean HUD overlay without nested box clutter |
| src/components/FloatingNav.tsx | B | mode switching latency | Primary floating navigation and search hub |
| src/components/FolderTreePicker.tsx | B | directory selection speed | Local filesystem directory tree picker |
| src/components/IndexerStatusPill.tsx | C | indexing progress visibility | Real-time background worker status indicator |
| src/components/InfiniteCanvas.tsx | B | spatial canvas exploration density | WebGL/DOM infinite zoomable pan canvas |
| src/components/LibrarySwitcher.tsx | B | library switching latency | Library dropdown with clean iconography |
| src/components/LibraryToggleSwitch.tsx | B | active source selection speed | Dual-source toggle control |
| src/components/ModelSettingsModal.tsx | C | AI model configuration integrity | Embedding model and batch size settings |
| src/components/MotionVideoPreview.tsx | B | video scrubbing responsiveness | Smooth hover video preview track |
| src/components/MultiColorPickerPopover.tsx | B | chromatic filter precision | Multi-hue palette filter popover |
| src/components/OmnimageLogo.tsx | B | brand recognition | Constellation vector logo without hover-scale |
| src/components/RecentlyViewedDock.tsx | B | context recall speed | Quick-access recently inspected items dock |
| src/components/ShortcutsModal.tsx | B | keyboard shortcut discovery | Keyboard navigation help cheat sheet |
| src/components/TagAutocompletePopover.tsx | B | search query precision | Autocomplete query tag builder |
| src/components/TaxonomyPopover.tsx | B | filter selection speed | Clean tag filter with tabular counts |
| src/components/ui/AsciiImageReveal.tsx | B | perceived load latency | Progressive ASCII image reveal fallback |
| src/components/ui/AsciiReveal.tsx | B | perceived load latency | Text glyph reveal animation |
| src/components/ui/AsciiSkeleton.tsx | B | perceived load latency | Monospace placeholder skeleton |
| src/components/ui/button.tsx | B | interaction affordance | Base button design primitives |
| src/components/ui/dialog.tsx | B | modal focus clarity | Base accessible dialog overlay primitive |
| src/components/ui/dropdown-menu.tsx | B | menu selection speed | Base accessible dropdown primitive |
| src/components/ui/popover.tsx | B | popover focus clarity | Base accessible popover container |
| src/components/ui/tooltip.tsx | B | informational discovery speed | Subtle tooltip helper primitive |
| src/components/viewer/ComparisonSidebar.tsx | B | parameter comparison speed | Comparison metadata diff sidebar |
| src/components/viewer/ImageStage.tsx | B | image inspection fidelity | Primary image presentation viewport |
| src/components/viewer/SimilarGrid.tsx | B | visual recommendation discovery | Similar image vector cluster grid |
| src/components/viewer/ViewerSidebar.tsx | B | generation parameter extraction | Inspector sidebar for prompt and seed metadata |
| src/i18n/index.tsx | B | localization accessibility | Translation and language state context |
| src/main.tsx | B | application startup latency | React DOM entry point |

## Screen seen

| Screen | Route / View | Width | Data State | Result / Observation |
|---|---|---|---|---|
| Infinite Canvas | / | 1920x1080 | 120 artworks loaded | Smooth zoom/pan, clean contrast, zero synthetic dot grid noise |
| Single Artwork Viewer | Modal | 1920x1080 | Full metadata & dominant color | Clean typography, no font-mono clutter, crisp borders |
| Comparison Stage | Modal Split | 1920x1080 | Dual image compare | Clean Ref A / B headers, instant diff view |
| MultiColorPicker | Popover | 1920x1080 | Color filter active | Clean flat segmented control, zero box-in-box |
| Floating Navigation | Nav Dock | 1920x1080 | Library switched | Zero backdrop-blur noise, crisp solid dark surfaces |
| Floating Info HUD | Overlay | 1920x1080 | Artwork hovered | Flat layout sections, no mono-everywhere or FPS tags |

## Findings

- Initial chrome-noise findings: 127 across 40 interface files.
- Current chrome-noise findings: 0 (clean).
- AI tells (impeccable): 0.
- Copy/language tics: 0 across 122 interface strings.
- Design token conformance: 0 violations via repo `npm run lint:design`.
