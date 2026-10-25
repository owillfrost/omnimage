import { contextBridge, ipcRenderer } from 'electron'

export interface OmnimageDesktopApi {
  isElectron: true
  platform: string
  selectDirectory: () => Promise<string | null>
  showItemInFolder: (libraryId: string, itemId: string) => Promise<{ ok: boolean; filePath?: string }>
  startDrag: (libraryId: string, itemId: string) => void
  onIndexerStatus: (callback: (status: any) => void) => () => void
}

const omnimageDesktop: OmnimageDesktopApi = {
  isElectron: true,
  platform: process.platform,
  selectDirectory: () => ipcRenderer.invoke('omnimage:select-directory'),
  showItemInFolder: (libraryId: string, itemId: string) =>
    ipcRenderer.invoke('omnimage:show-item-in-folder', { libraryId, itemId }),
  startDrag: (libraryId: string, itemId: string) =>
    ipcRenderer.send('omnimage:start-drag', { libraryId, itemId }),
  onIndexerStatus: (callback) => {
    const handler = (_event: any, status: any) => callback(status)
    ipcRenderer.on('omnimage:indexer-status', handler)
    return () => ipcRenderer.removeListener('omnimage:indexer-status', handler)
  },
}

contextBridge.exposeInMainWorld('omnimageDesktop', omnimageDesktop)
