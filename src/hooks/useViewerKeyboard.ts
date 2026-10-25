import { useEffect } from 'react'

const isShortcutsModalOpen = () =>
  !!document.querySelector('[role="dialog"][data-shortcuts-modal="true"]')

export interface ViewerKeyboardHandlers {
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onTogglePin?: () => void
  onSwap?: () => void
  isComparing?: boolean
  onClearCompare?: () => void
}

/**
 * Keyboard navigation for the fullscreen viewer (← → Esc, P for Pin/Compare, X for Swap).
 * Ignored while the shortcuts modal or text inputs are focused.
 */
export function useViewerKeyboard(enabled: boolean, handlers: ViewerKeyboardHandlers) {
  const { onClose, onPrev, onNext, onTogglePin, onSwap, isComparing, onClearCompare } = handlers

  useEffect(() => {
    if (!enabled) return
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }

      if (isShortcutsModalOpen()) return

      if (e.key === 'Escape') {
        e.preventDefault()
        if (isComparing && onClearCompare) {
          onClearCompare()
        } else {
          onClose()
        }
        return
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        onPrev()
        return
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        onNext()
        return
      }

      if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        onTogglePin?.()
        return
      }

      if ((e.key === 'x' || e.key === 'X') && !e.ctrlKey && !e.metaKey) {
        if (isComparing && onSwap) {
          e.preventDefault()
          onSwap()
          return
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, onClose, onPrev, onNext, onTogglePin, onSwap, isComparing, onClearCompare])
}
