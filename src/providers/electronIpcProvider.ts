import { LocalHttpProvider } from './localHttpProvider'

declare global {
  interface Window {
    omnimageDesktop?: {
      isElectron: true
      platform: string
      selectDirectory: () => Promise<string | null>
      showItemInFolder: (libraryId: string, itemId: string) => Promise<{ ok: boolean; filePath?: string }>
      startDrag: (libraryId: string, itemId: string) => void
      onIndexerStatus: (callback: (status: any) => void) => () => void
    }
  }
}

/**
 * Electron Desktop IPC Catalog Provider.
 * Integrates directly with Electron's privileged omnimage-media:// scheme for zero-socket media streaming,
 * native dialogs, and native file drag-out.
 */
export class ElectronIpcProvider extends LocalHttpProvider {
  constructor() {
    // Connect to the embedded backend on port 41596 (or current dev port)
    super(typeof window !== 'undefined' && window.location.port === '5173' ? '' : 'http://localhost:41596')
  }

  override getMediaUrl(libraryId: string, rawItemId: string, type: 'thumb' | 'full'): string {
    // Use privileged direct filesystem protocol registered in electron/main.ts
    if (typeof window !== 'undefined' && window.omnimageDesktop?.isElectron) {
      return `omnimage-media://${type}/${encodeURIComponent(libraryId)}/${encodeURIComponent(rawItemId)}`
    }
    return super.getMediaUrl(libraryId, rawItemId, type)
  }

  override async revealItemInExplorer(
    libraryId: string,
    rawItemId: string
  ): Promise<{ ok: boolean; filePath?: string }> {
    if (typeof window !== 'undefined' && window.omnimageDesktop?.showItemInFolder) {
      return await window.omnimageDesktop.showItemInFolder(libraryId, rawItemId)
    }
    return super.revealItemInExplorer(libraryId, rawItemId)
  }
}
