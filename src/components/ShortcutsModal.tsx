import * as React from 'react'
import { X, Command, Globe } from 'lucide-react'
import { AsciiReveal } from './ui/AsciiReveal'
import { getLocalizedShortcutGroups, type ShortcutContext } from '../config/shortcuts'
import { useI18n } from '../i18n'

export interface ShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
  activeContext?: 'viewer' | 'canvas' | 'explore'
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({
  isOpen,
  onClose,
  activeContext = 'canvas',
}) => {
  const { locale, setLocale, t } = useI18n()
  const modalRef = React.useRef<HTMLDivElement | null>(null)
  const previousActiveElementRef = React.useRef<HTMLElement | null>(null)

  // Store previously focused element and manage focus trapping
  React.useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement
      // Focus modal container
      modalRef.current?.focus()
    } else if (previousActiveElementRef.current) {
      previousActiveElementRef.current.focus()
    }
  }, [isOpen])

  // Trap focus inside modal
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }

      if (e.key === 'Tab') {
        const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (!focusableElements || focusableElements.length === 0) return

        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault()
            lastElement.focus()
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault()
            firstElement.focus()
          }
        }
      }
    },
    [onClose]
  )

  // Sort groups context-aware: prioritize the active screen's group right after general
  const sortedGroups = React.useMemo(() => {
    const targetContext: ShortcutContext =
      activeContext === 'viewer'
        ? 'viewer'
        : activeContext === 'explore'
          ? 'explore'
          : 'canvas'

    const localizedGroups = getLocalizedShortcutGroups(locale)

    return [...localizedGroups].sort((a, b) => {
      if (a.context === 'general') return -1
      if (b.context === 'general') return 1
      if (a.context === targetContext) return -1
      if (b.context === targetContext) return 1
      return 0
    })
  }, [activeContext, locale])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150 select-none"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('shortcuts.modalTitle')}
        data-shortcuts-modal="true"
        data-ascii="surface"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl max-h-[85vh] bg-zinc-950/95 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col focus:outline-none"
      >
        <AsciiReveal preset="blueprint" duration="fast" speed={1.6} className="contents">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/30">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700/80 text-zinc-100">
              <Command className="w-4 h-4 text-white" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                {t('shortcuts.modalTitle')}
              </h2>
              <p className="text-[11px] text-zinc-400">
                {t('shortcuts.modalSubtitle')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            title={t('shortcuts.closeTooltip')}
            aria-label={t('shortcuts.closeTooltip')}
            className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Scrollable Shortcut Groups */}
        <div className="overflow-y-auto px-6 py-5 space-y-6 flex-1">
          {sortedGroups.map((group) => {
            const isContextActive =
              (activeContext === 'viewer' && group.context === 'viewer') ||
              (activeContext === 'canvas' && group.context === 'canvas') ||
              (activeContext === 'explore' && group.context === 'explore')

            return (
              <section key={group.context} className="space-y-2.5">
                <div className="flex items-center justify-between pb-1 border-b border-zinc-800/50">
                  <h3 className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                    {group.title}
                  </h3>
                  {isContextActive && (
                    <span className="text-[9px] font-medium uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      {t('shortcuts.currentContext')}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-zinc-900/50 transition-colors"
                    >
                      <span className="text-xs text-zinc-300 font-medium pr-4">
                        {item.description}
                      </span>

                      <div className="flex items-center gap-1 shrink-0">
                        {item.keys.map((key, kIdx) => (
                          <React.Fragment key={`${item.id}-${key}-${kIdx}`}>
                            {kIdx > 0 && (
                              <span className="text-[10px] text-zinc-500 font-mono">+</span>
                            )}
                            <kbd className="inline-flex items-center justify-center min-w-5 px-2 py-0.5 text-[11px] font-mono font-medium text-zinc-200 bg-zinc-900 border border-zinc-700/80 rounded-md shadow-xs shadow-black/40">
                              {key}
                            </kbd>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800/80 bg-zinc-900/40 text-[11px] text-zinc-500 flex items-center justify-between">
          <span>{locale === 'en' ? 'Press' : 'Pressione'} <kbd className="font-mono text-zinc-300">?</kbd> {locale === 'en' ? 'or' : 'ou'} <kbd className="font-mono text-zinc-300">Esc</kbd> {locale === 'en' ? 'to close' : 'para fechar'}</span>
          <div className="flex items-center gap-2">
            {/* Quick Language Switcher */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-[10px] font-mono">
              <Globe className="w-3 h-3 text-zinc-500 ml-1" />
              <button
                type="button"
                onClick={() => setLocale('en')}
                className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                  locale === 'en'
                    ? 'bg-zinc-800 text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLocale('pt')}
                className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                  locale === 'pt'
                    ? 'bg-zinc-800 text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                PT
              </button>
            </div>
            <span className="font-mono text-[10px] text-zinc-500">Omnimage</span>
          </div>
        </div>
        </AsciiReveal>
      </div>
    </div>
  )
}
