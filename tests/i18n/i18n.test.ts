import { describe, it, expect } from 'vitest'
import { getTranslation, formatTemplate } from '../../src/i18n'
import { en } from '../../src/i18n/locales/en'
import { pt } from '../../src/i18n/locales/pt'
import { getLocalizedShortcutGroups, SHORTCUT_GROUPS } from '../../src/config/shortcuts'

describe('i18n system', () => {
  it('has identical keys in both English and Portuguese dictionaries', () => {
    function getDeepKeys(obj: any, prefix = ''): string[] {
      return Object.keys(obj).flatMap((key) => {
        const val = obj[key]
        const fullKey = prefix ? `${prefix}.${key}` : key
        if (typeof val === 'object' && val !== null) {
          return getDeepKeys(val, fullKey)
        }
        return [fullKey]
      })
    }

    const enKeys = getDeepKeys(en).sort()
    const ptKeys = getDeepKeys(pt).sort()

    expect(enKeys).toEqual(ptKeys)
  })

  it('formats templates with dynamic params', () => {
    const res = formatTemplate('Hello {name}, count: {count}', { name: 'Omnimage', count: 42 })
    expect(res).toBe('Hello Omnimage, count: 42')
  })

  it('translates correctly in English by default', () => {
    const title = getTranslation('colorPicker.title', 'en')
    expect(title).toBe('Filter by colors')

    const withParam = getTranslation('nav.catalogConnected', 'en', { count: '1,000' })
    expect(withParam).toBe('Catalog connected (1,000 items)')
  })

  it('translates correctly in Portuguese when requested', () => {
    const title = getTranslation('colorPicker.title', 'pt')
    expect(title).toBe('Filtrar por cores')

    const withParam = getTranslation('nav.catalogConnected', 'pt', { count: '1.000' })
    expect(withParam).toBe('Catálogo conectado (1.000 itens)')
  })

  it('produces localized shortcut groups', () => {
    const enGroups = getLocalizedShortcutGroups('en')
    const ptGroups = getLocalizedShortcutGroups('pt')

    expect(enGroups[0].title).toBe('GENERAL')
    expect(ptGroups[0].title).toBe('GERAL')

    const enGeneral = enGroups[0].items[0]
    const ptGeneral = ptGroups[0].items[0]

    expect(enGeneral.description).toBe('Open / close this shortcuts guide')
    expect(ptGeneral.description).toBe('Abrir / fechar esta janela de atalhos')

    // Verify default export is English
    expect(SHORTCUT_GROUPS[0].title).toBe('GENERAL')
  })
})
