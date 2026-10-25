/**
 * Centralized Theme & Accent Color Tokens
 * 
 * Edit colors here to update the entire application.
 */

// 1. Semantic Accents used across UI components
export const THEME_ACCENTS = {
  // Brand / Default system accent
  system: {
    accent: '#ffffff',
    foreground: '#000000',
  },
  // AI, Semantic Search & Upload states (Sparkles, loading, active search pills)
  ai: {
    base: '#EEE14B',
    hover: '#f5eb6d',
    subtle: 'rgba(238, 225, 75, 0.15)',
    border: 'rgba(238, 225, 75, 0.35)',
    glow: 'rgba(238, 225, 75, 0.14)',
  },
  // Status, Success & Confirmation (Copied feedback, tags, healthy status)
  success: {
    base: '#10b981',       // Emerald 500
    hover: '#34d399',      // Emerald 400
    subtle: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.30)',
  },
  // Connection & Active Refresh states
  info: {
    base: '#3b82f6',       // Blue 500
    hover: '#60a5fa',      // Blue 400
    subtle: 'rgba(59, 130, 246, 0.15)',
    border: 'rgba(59, 130, 246, 0.30)',
  },
} as const

/**
 * 2. Accent Preset Colors for Chromatic Wheel & Color Filter
 * Strictly limited to at most 4 curated signature hues.
 */
export const ACCENT_PRESET_COLORS = [
  { id: 'electric-blue', label: 'Electric Blue', hex: '#4694F6' },
  { id: 'emerald',       label: 'Emerald Green', hex: '#81B386' },
  { id: 'warm-amber',    label: 'Warm Amber',    hex: '#EBB042' },
  { id: 'orchid-rose',   label: 'Orchid Rose',   hex: '#C877CB' },
] as const

/**
 * Maximum number of simultaneous filter color slots allowed
 */
export const MAX_FILTER_COLORS = 4

/**
 * Default color to initialize picker with
 */
export const DEFAULT_PICKER_COLOR = ACCENT_PRESET_COLORS[0].hex


