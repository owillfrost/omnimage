import { app, BrowserWindow, protocol, ipcMain, net } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import {
  initializeBackend,
  autoSeedLibrariesIfEmpty,
  startStandaloneServer,
  closeSqliteDb,
} from '../server/index'
import { resolveMediaFilePath } from '../server/media/mediaStreamServer'
import { showItemInFolder, showOpenDirectoryDialog, startFileDrag } from './nativeActions'

// Register privileged custom scheme for zero-socket direct media streaming
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'omnimage-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
    },
  },
])

let mainWindow: BrowserWindow | null = null
let serverInstance: any = null

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: 'Omnimage - Visual Asset Catalog',
    backgroundColor: '#09090b',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_START_URL
  if (devUrl) {
    await mainWindow.loadURL(devUrl)
  } else {
    const indexPath = path.resolve(import.meta.dirname, '../dist/index.html')
    if (fs.existsSync(indexPath)) {
      await mainWindow.loadFile(indexPath)
    } else {
      // Fallback dev port
      await mainWindow.loadURL('http://127.0.0.1:5173')
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  // 1. Initialize SQLite Database & Background Services
  try {
    initializeBackend()
    // Auto-seed libraries on startup in background
    autoSeedLibrariesIfEmpty().catch(err => {
      console.warn('[Startup] Auto-seed background notice:', err)
    })
    serverInstance = startStandaloneServer(41596)
  } catch (err) {
    console.error('[Startup] Failed to initialize backend:', err)
  }

  // 2. Custom Protocol Handler: omnimage-media://{type}/{libraryId}/{itemId}
  protocol.handle('omnimage-media', async (request) => {
    try {
      const url = new URL(request.url)
      const type = (url.host || 'thumb') as 'thumb' | 'full'
      const parts = url.pathname.replace(/^\//, '').split('/')
      const libraryId = parts[0] || 'design'
      const itemId = parts[1] || ''

      const filePath = resolveMediaFilePath(libraryId, itemId, type)
      if (!filePath || !fs.existsSync(filePath)) {
        return new Response('Media file not found', { status: 404 })
      }

      // Stream file directly with full range (HTTP 206) support via net.fetch
      const fileUrl = pathToFileURL(filePath).toString()
      return await net.fetch(fileUrl, { headers: request.headers })
    } catch (err: any) {
      console.error('[Protocol omnimage-media] Error:', err)
      return new Response(err?.message || 'Media stream error', { status: 500 })
    }
  })

  // 3. Register IPC Handlers
  ipcMain.handle('omnimage:select-directory', async () => {
    return await showOpenDirectoryDialog(mainWindow || undefined)
  })

  ipcMain.handle('omnimage:show-item-in-folder', async (_event, args: { libraryId: string; itemId: string }) => {
    const filePath = resolveMediaFilePath(args.libraryId, args.itemId, 'full')
    if (!filePath) return { ok: false }
    return await showItemInFolder(filePath)
  })

  ipcMain.on('omnimage:start-drag', (event, args: { libraryId: string; itemId: string }) => {
    const fullPath = resolveMediaFilePath(args.libraryId, args.itemId, 'full')
    const thumbPath = resolveMediaFilePath(args.libraryId, args.itemId, 'thumb')
    if (fullPath) {
      startFileDrag(event.sender, fullPath, thumbPath || undefined)
    }
  })

  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Graceful shutdown: safely close SQLite and save any in-flight WAL buffers
app.on('before-quit', () => {
  try {
    closeSqliteDb()
    if (serverInstance && typeof serverInstance.close === 'function') {
      serverInstance.close()
    }
  } catch {
    // ignore
  }
})
