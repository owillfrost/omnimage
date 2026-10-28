import { getTranslation, type Locale } from '../i18n'

export type ShortcutContext = 'general' | 'viewer' | 'canvas' | 'explore' | 'search'

export interface ShortcutItem {
  id: string
  description: string
  keys: string[]
  context: ShortcutContext
}

export interface ShortcutGroup {
  context: ShortcutContext
  title: string
  items: ShortcutItem[]
}

/**
 * Generates the single source of truth for all verified keyboard shortcuts and gestures,
 * localized to the specified locale (defaults to English 'en').
 */
export function getLocalizedShortcutGroups(locale: Locale = 'en'): ShortcutGroup[] {
  const t = (key: any) => getTranslation(key, locale)

  return [
    {
      context: 'general',
      title: t('shortcuts.groups.general'),
      items: [
        {
          id: 'toggle-shortcuts',
          description: t('shortcuts.items.toggleShortcuts'),
          keys: ['?'],
          context: 'general',
        },
        {
          id: 'close-modal-or-clear',
          description: t('shortcuts.items.closeModalOrClear'),
          keys: ['Esc'],
          context: 'general',
        },
      ],
    },
    {
      context: 'viewer',
      title: t('shortcuts.groups.viewer'),
      items: [
        {
          id: 'viewer-prev',
          description: t('shortcuts.items.viewerPrev'),
          keys: ['←'],
          context: 'viewer',
        },
        {
          id: 'viewer-next',
          description: t('shortcuts.items.viewerNext'),
          keys: ['→'],
          context: 'viewer',
        },
        {
          id: 'viewer-close',
          description: t('shortcuts.items.viewerClose'),
          keys: ['Esc'],
          context: 'viewer',
        },
        {
          id: 'viewer-drag',
          description: t('shortcuts.items.viewerDrag'),
          keys: [t('shortcuts.keys.drag')],
          context: 'viewer',
        },
        {
          id: 'viewer-scroll-similar',
          description: t('shortcuts.items.viewerScrollSimilar'),
          keys: ['Scroll ↓'],
          context: 'viewer',
        },
        {
          id: 'viewer-zoom-levels',
          description: t('shortcuts.items.viewerZoomLevels'),
          keys: ['1x', '1.5x', '2.5x'],
          context: 'viewer',
        },
        {
          id: 'viewer-zoom-reset',
          description: t('shortcuts.items.viewerZoomReset'),
          keys: ['Reset'],
          context: 'viewer',
        },
        {
          id: 'viewer-pin-compare',
          description: t('shortcuts.items.viewerPinCompare'),
          keys: ['P', t('shortcuts.keys.shiftClick')],
          context: 'viewer',
        },
        {
          id: 'viewer-swap-split',
          description: t('shortcuts.items.viewerSwapSplit'),
          keys: ['X'],
          context: 'viewer',
        },
        {
          id: 'viewer-unpin-split',
          description: t('shortcuts.items.viewerUnpinSplit'),
          keys: ['Esc'],
          context: 'viewer',
        },
      ],
    },
    {
      context: 'canvas',
      title: t('shortcuts.groups.canvas'),
      items: [
        {
          id: 'canvas-drag-pan',
          description: t('shortcuts.items.canvasDragPan'),
          keys: [t('shortcuts.keys.leftClick'), t('shortcuts.keys.drag')],
          context: 'canvas',
        },
        {
          id: 'canvas-wheel-pan',
          description: t('shortcuts.items.canvasWheelPan'),
          keys: [t('shortcuts.keys.mouseWheel')],
          context: 'canvas',
        },
        {
          id: 'canvas-color-anchor',
          description: t('shortcuts.items.canvasColorAnchor'),
          keys: [t('shortcuts.keys.cardClick')],
          context: 'canvas',
        },
        {
          id: 'canvas-anchor-prev',
          description: t('shortcuts.items.canvasAnchorPrev'),
          keys: ['Alt + ←'],
          context: 'canvas',
        },
        {
          id: 'canvas-anchor-next',
          description: t('shortcuts.items.canvasAnchorNext'),
          keys: ['Alt + →'],
          context: 'canvas',
        },
        {
          id: 'canvas-density',
          description: t('shortcuts.items.canvasDensity'),
          keys: [t('shortcuts.keys.gridControls')],
          context: 'canvas',
        },
        {
          id: 'canvas-shuffle',
          description: t('shortcuts.items.canvasShuffle'),
          keys: [t('shortcuts.keys.shuffle')],
          context: 'canvas',
        },
        {
          id: 'canvas-recenter',
          description: t('shortcuts.items.canvasRecenter'),
          keys: [t('shortcuts.keys.recenter')],
          context: 'canvas',
        },
      ],
    },
    {
      context: 'explore',
      title: t('shortcuts.groups.explore'),
      items: [
        {
          id: 'explore-scroll',
          description: t('shortcuts.items.exploreScroll'),
          keys: ['Scroll ↑/↓'],
          context: 'explore',
        },
        {
          id: 'explore-open-card',
          description: t('shortcuts.items.exploreOpenCard'),
          keys: [t('shortcuts.keys.cardClick')],
          context: 'explore',
        },
        {
          id: 'explore-back-to-top',
          description: t('shortcuts.items.exploreBackToTop'),
          keys: [t('shortcuts.keys.backToTop')],
          context: 'explore',
        },
      ],
    },
    {
      context: 'search',
      title: t('shortcuts.groups.search'),
      items: [
        {
          id: 'search-typing',
          description: t('shortcuts.items.searchTyping'),
          keys: [t('shortcuts.keys.typeInSearch')],
          context: 'search',
        },
        {
          id: 'color-palette-filter',
          description: t('shortcuts.items.colorPaletteFilter'),
          keys: [t('shortcuts.keys.colorPalette')],
          context: 'search',
        },
        {
          id: 'library-switch',
          description: t('shortcuts.items.librarySwitch'),
          keys: [t('shortcuts.keys.toggleLibrary')],
          context: 'search',
        },
        {
          id: 'media-filter-toggle',
          description: t('shortcuts.items.mediaFilterToggle'),
          keys: ['V'],
          context: 'search',
        },
        {
          id: 'motion-scrubbing',
          description: t('shortcuts.items.motionScrubbing'),
          keys: [t('shortcuts.keys.hover350ms'), t('shortcuts.keys.moveCursor')],
          context: 'search',
        },
      ],
    },
  ]
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = getLocalizedShortcutGroups('en')
