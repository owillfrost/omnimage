import type { IncomingMessage, ServerResponse } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { getLibrariesConfig } from '../config/librariesConfig'

const SAFE_ID_REGEX = /^[A-Za-z0-9_-]{8,64}$/
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv'])

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
}

// In-memory cache for resolved file paths to avoid repeated disk reads (O(1) resolution)
const mediaPathCache = new Map<string, string>()

export function clearMediaPathCache(): void {
  mediaPathCache.clear()
}

export function resolveMediaFilePath(
  libraryId: string,
  itemId: string,
  type: 'thumb' | 'full' = 'thumb',
  customRootPath?: string
): string | null {
  if (!itemId || !SAFE_ID_REGEX.test(itemId)) {
    return null
  }

  const cacheKey = `${libraryId}:${itemId}:${type}`
  const cached = mediaPathCache.get(cacheKey)
  if (cached && fs.existsSync(cached)) {
    return cached
  }

  let rootPath = customRootPath
  if (!rootPath) {
    const configs = getLibrariesConfig()
    const config = configs.find(c => c.id === libraryId)
    rootPath = config?.path
  }

  if (!rootPath || !fs.existsSync(rootPath)) {
    return null
  }

  let itemDir = path.join(rootPath, 'images', `${itemId}.info`)
  if (!fs.existsSync(itemDir)) {
    // Check if a sibling .library container exists for this source folder
    const siblingLib = path.join(path.dirname(rootPath.replace(/[\\/]+$/, '')), `${libraryId}.library`, 'images', `${itemId}.info`)
    if (fs.existsSync(siblingLib)) {
      itemDir = siblingLib
    } else {
      // Fallback for sidecar items (.omnimage or legacy .cosmos) before .library migration
      const shard = itemId.length >= 2 ? itemId.slice(0, 2).toUpperCase() : '00'
      for (const metaFolder of ['.omnimage', '.cosmos']) {
        if (type === 'thumb') {
          const sidecarThumb = path.join(rootPath, metaFolder, 'thumbnails', shard, `${itemId}.webp`)
          if (fs.existsSync(sidecarThumb)) {
            mediaPathCache.set(cacheKey, sidecarThumb)
            return sidecarThumb
          }
        }
        const sidecarFile = path.join(rootPath, metaFolder, 'items', shard, `${itemId}.json`)
        if (fs.existsSync(sidecarFile)) {
          try {
            const meta = JSON.parse(fs.readFileSync(sidecarFile, 'utf-8'))
            const rel = type === 'thumb' && meta.thumbRelPath ? meta.thumbRelPath : (meta.mediaRelPath || meta.relativePath)
            if (rel) {
              const candidate = path.resolve(rootPath, rel)
              if (fs.existsSync(candidate)) {
                mediaPathCache.set(cacheKey, candidate)
                return candidate
              }
            }
          } catch {
            // ignore
          }
        }
      }
      return null
    }
  }

  let files: string[]
  try {
    files = fs.readdirSync(itemDir)
  } catch {
    return null
  }

  let targetFile: string | undefined

  if (type === 'thumb') {
    targetFile = files.find(f => {
      const lower = f.toLowerCase()
      return lower.endsWith('_thumbnail.webp') || lower.endsWith('_thumbnail.png')
    })
  }

  // Fallback to primary media file if thumbnail is not available or requested type is full
  if (!targetFile) {
    targetFile = files.find(f => {
      const lower = f.toLowerCase()
      return (
        !lower.endsWith('_thumbnail.png') &&
        !lower.endsWith('_thumbnail.webp') &&
        !lower.endsWith('metadata.json')
      )
    })
  }

  if (!targetFile) {
    return null
  }

  const resolvedPath = path.join(itemDir, targetFile)
  mediaPathCache.set(cacheKey, resolvedPath)
  return resolvedPath
}

export async function handleMediaStream(
  req: IncomingMessage,
  res: ServerResponse,
  libraryId: string,
  itemId: string,
  type: 'thumb' | 'full' = 'thumb',
  customRootPath?: string
): Promise<void> {
  if (!itemId || !SAFE_ID_REGEX.test(itemId)) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'text/plain')
    res.end('Invalid or missing item ID')
    return
  }

  const fullFilePath = resolveMediaFilePath(libraryId, itemId, type, customRootPath)

  if (!fullFilePath || !fs.existsSync(fullFilePath)) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain')
    res.end('Media file not found')
    return
  }

  let stat: fs.Stats
  try {
    stat = await fs.promises.stat(fullFilePath)
  } catch {
    res.statusCode = 500
    res.setHeader('Content-Type', 'text/plain')
    res.end('Error accessing media file')
    return
  }

  const fileSize = stat.size
  const ext = path.extname(fullFilePath).toLowerCase()
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream'

  // Standard immutable caching with strong ETag
  const etag = `"${libraryId}-${itemId}-${type}-${stat.mtimeMs.toString(36)}-${fileSize.toString(36)}"`
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  res.setHeader('ETag', etag)
  res.setHeader('Accept-Ranges', 'bytes')

  if (req.headers['if-none-match'] === etag) {
    res.statusCode = 304
    res.end()
    return
  }

  const range = req.headers.range
  const isVideo = VIDEO_EXTS.has(ext.replace(/^\./, ''))

  // Handle HTTP 206 Partial Content for video seeking & scrubbing
  if (range && isVideo) {
    const parts = range.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

    if (isNaN(start) || start >= fileSize || end >= fileSize || (parts[1] && end < start)) {
      res.statusCode = 416
      res.setHeader('Content-Range', `bytes */${fileSize}`)
      res.end()
      return
    }

    const chunkSize = end - start + 1
    res.statusCode = 206
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`)
    res.setHeader('Content-Length', chunkSize)
    res.setHeader('Content-Type', mimeType)

    const stream = fs.createReadStream(fullFilePath, { start, end })
    stream.on('error', () => {
      if (!res.headersSent) res.statusCode = 500
      res.end()
    })
    stream.pipe(res)
    return
  }

  // Full content stream
  res.setHeader('Content-Length', fileSize)
  res.setHeader('Content-Type', mimeType)

  const stream = fs.createReadStream(fullFilePath)
  stream.on('error', () => {
    if (!res.headersSent) res.statusCode = 500
    res.end()
  })
  stream.pipe(res)
}
