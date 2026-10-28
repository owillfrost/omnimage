import { shell, dialog, type BrowserWindow, type WebContents } from 'electron'
import fs from 'node:fs'

/**
 * Shows an item in the system file manager (Windows Explorer, macOS Finder, Linux file manager).
 * Replaces platform-specific explorer.exe calls with cross-platform native Electron shell.
 */
export async function showItemInFolder(filePath: string): Promise<{ ok: boolean; filePath?: string }> {
  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false }
  }

  try {
    shell.showItemInFolder(filePath)
    return { ok: true, filePath }
  } catch (err) {
    console.error('[NativeActions] Failed to show item in folder:', err)
    return { ok: false }
  }
}

/**
 * Opens a native OS directory picker dialog.
 */
export async function showOpenDirectoryDialog(window?: BrowserWindow): Promise<string | null> {
  const result = window
    ? await dialog.showOpenDialog(window, {
        title: 'Select Visual Assets Folder',
        properties: ['openDirectory', 'createDirectory'],
      })
    : await dialog.showOpenDialog({
        title: 'Select Visual Assets Folder',
        properties: ['openDirectory', 'createDirectory'],
      })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
}

/**
 * Initiates native OS drag-out of an artwork file into external applications
 * (Figma, Photoshop, Blender, Web Browsers).
 */
export function startFileDrag(webContents: WebContents, filePath: string, iconPath?: string): void {
  if (!filePath || !fs.existsSync(filePath)) {
    return
  }

  webContents.startDrag({
    file: filePath,
    icon: iconPath && fs.existsSync(iconPath) ? iconPath : filePath,
  })
}
