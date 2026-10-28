import * as React from 'react'
import type { Locale, TranslationKey, TranslationDictionary } from './types'
import { en } from './locales/en'
import { pt } from './locales/pt'

export * from './types'

const LOCAL_STORAGE_KEY = 'omnimage_locale'
const DEFAULT_LOCALE: Locale = 'en'

const dictionaries: Record<Locale, TranslationDictionary> = {
  en,
  pt,
}

function getInitialLocale(): Locale {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(LOCAL_STORAGE_KEY)
      if (saved === 'en' || saved === 'pt') {
        return saved
      }
    }
  } catch {
    // Ignore storage access errors
  }
  return DEFAULT_LOCALE
}

function resolveNestedKey(obj: any, path: string): string | undefined {
  const parts = path.split('.')
  let curr = obj
  for (const part of parts) {
    if (curr === undefined || curr === null) return undefined
    curr = curr[part]
  }
  return typeof curr === 'string' ? curr : undefined
}

export function formatTemplate(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key] !== undefined ? String(params[key]) : `{${key}}`
  })
}

export function getTranslation(
  key: TranslationKey,
  locale: Locale = DEFAULT_LOCALE,
  params?: Record<string, string | number>
): string {
  const dict = dictionaries[locale] || dictionaries[DEFAULT_LOCALE]
  const val = resolveNestedKey(dict, key) || resolveNestedKey(dictionaries[DEFAULT_LOCALE], key) || key
  return formatTemplate(val, params)
}

interface LanguageContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  toggleLocale: () => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

const LanguageContext = React.createContext<LanguageContextValue | null>(null)

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = React.useState<Locale>(getInitialLocale)

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, next)
      }
      window.dispatchEvent(new CustomEvent('omnimage:locale-change', { detail: next }))
    } catch {
      // Ignore storage errors
    }
  }, [])

  const toggleLocale = React.useCallback(() => {
    setLocale(locale === 'en' ? 'pt' : 'en')
  }, [locale, setLocale])

  React.useEffect(() => {
    // Sync across tabs and devtools events
    const handleStorage = (e: StorageEvent) => {
      if (e.key === LOCAL_STORAGE_KEY && (e.newValue === 'en' || e.newValue === 'pt')) {
        setLocaleState(e.newValue)
      }
    }

    const handleCustomEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail === 'en' || detail === 'pt') {
        setLocaleState(detail)
      }
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('omnimage:locale-change', handleCustomEvent)

    // Expose convenient test helper in dev console
    ;(window as any).setOmnimageLanguage = (lang: Locale) => {
      if (lang === 'en' || lang === 'pt') {
        setLocale(lang)
        console.log(`[i18n] Language switched to: ${lang.toUpperCase()}`)
      } else {
        console.warn(`[i18n] Invalid language: "${lang}". Supported: "en", "pt"`)
      }
    }
    ;(window as any).getOmnimageLanguage = () => locale

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('omnimage:locale-change', handleCustomEvent)
    }
  }, [locale, setLocale])

  const t = React.useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => {
      return getTranslation(key, locale, params)
    },
    [locale]
  )

  const value = React.useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale,
      toggleLocale,
      t,
    }),
    [locale, setLocale, toggleLocale, t]
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useI18n(): LanguageContextValue {
  const ctx = React.useContext(LanguageContext)
  if (!ctx) {
    // Fallback if rendered outside LanguageProvider
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      toggleLocale: () => {},
      t: (key: TranslationKey, params?: Record<string, string | number>) =>
        getTranslation(key, DEFAULT_LOCALE, params),
    }
  }
  return ctx
}
