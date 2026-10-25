import { describe, it, expect, beforeEach } from 'vitest'
import { ElectronIpcProvider } from '../../src/providers/electronIpcProvider'
import { WebOpfsProvider } from '../../src/providers/webOpfsProvider'
import { getCatalogProvider, setCatalogProvider, createProviderByType } from '../../src/providers/providerFactory'
import { LocalHttpProvider } from '../../src/providers/localHttpProvider'

describe('Catalog Providers Unit Tests (Electron & Web OPFS)', () => {
  beforeEach(() => {
    // Reset global current provider
    setCatalogProvider(null as any)
  })

  it('ElectronIpcProvider generates omnimage-media:// scheme URLs when running in Electron desktop', () => {
    const provider = new ElectronIpcProvider()

    // Without window.omnimageDesktop, defaults to HTTP /api/catalog/media
    const httpThumb = provider.getMediaUrl('design', 'ITEM123', 'thumb')
    expect(httpThumb).toContain('/api/catalog/media?library=design&id=ITEM123&type=thumb')

    // Simulate Electron environment
    ;(globalThis as any).window = {
      omnimageDesktop: {
        isElectron: true,
        platform: 'win32',
      },
    }

    const electronThumb = provider.getMediaUrl('design', 'ITEM123', 'thumb')
    expect(electronThumb).toBe('omnimage-media://thumb/design/ITEM123')

    const electronFull = provider.getMediaUrl('google-flow', 'ITEM456', 'full')
    expect(electronFull).toBe('omnimage-media://full/google-flow/ITEM456')

    delete (globalThis as any).window
  })

  it('WebOpfsProvider initializes safely in browser environment without crashing', async () => {
    const webProvider = new WebOpfsProvider()
    const libs = await webProvider.listLibraries()

    expect(libs).toHaveLength(1)
    expect(libs[0].id).toBe('web-empty')

    const emptyArtworks = await webProvider.fetchArtworks('web-empty')
    expect(emptyArtworks).toEqual([])

    const taxonomy = await webProvider.fetchTaxonomy('web-empty')
    expect(taxonomy).toBeNull()

    const embeddings = await webProvider.fetchEmbeddingsBinary('web-empty')
    expect(embeddings).toBeNull()
  })

  it('providerFactory automatically picks the right provider and supports factory creation', () => {
    // 1. In standard Node/web environment -> LocalHttpProvider
    const defaultProvider = getCatalogProvider()
    expect(defaultProvider).toBeInstanceOf(LocalHttpProvider)

    // 2. Factory creation
    const http = createProviderByType('local-http')
    expect(http).toBeInstanceOf(LocalHttpProvider)

    const ipc = createProviderByType('electron-ipc')
    expect(ipc).toBeInstanceOf(ElectronIpcProvider)

    const web = createProviderByType('web-opfs')
    expect(web).toBeInstanceOf(WebOpfsProvider)
  })
})
