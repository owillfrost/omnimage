import type { ICatalogProvider } from '../contracts/catalogProvider'
import { LocalHttpProvider } from './localHttpProvider'
import { ElectronIpcProvider } from './electronIpcProvider'
import { WebOpfsProvider } from './webOpfsProvider'

let currentProvider: ICatalogProvider | null = null

export type ProviderType = 'local-http' | 'electron-ipc' | 'web-opfs'

export function getCatalogProvider(): ICatalogProvider {
  if (!currentProvider) {
    if (typeof window !== 'undefined' && window.omnimageDesktop?.isElectron) {
      currentProvider = new ElectronIpcProvider()
    } else {
      currentProvider = new LocalHttpProvider()
    }
  }
  return currentProvider
}

export function setCatalogProvider(provider: ICatalogProvider): void {
  currentProvider = provider
}

export function createProviderByType(type: ProviderType): ICatalogProvider {
  switch (type) {
    case 'electron-ipc':
      return new ElectronIpcProvider()
    case 'web-opfs':
      return new WebOpfsProvider()
    case 'local-http':
    default:
      return new LocalHttpProvider()
  }
}
