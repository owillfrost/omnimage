import { execFile } from 'node:child_process'
import { generateImageThumbnailAndPalette, type GeneratedThumbnailResult } from './thumbnailGenerator'

let ffmpegAvailable: boolean | null = null

export async function isFfmpegAvailable(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable

  return new Promise((resolve) => {
    execFile('ffmpeg', ['-version'], { timeout: 3000 }, (error) => {
      ffmpegAvailable = !error
      resolve(ffmpegAvailable)
    })
  })
}

/**
 * Extracts a video frame at t = 1.0s and generates a 640px WebP thumbnail with palette.
 * Falls back to an elegant filmstrip poster placeholder if ffmpeg is unavailable.
 */
export async function generateVideoThumbnailAndPalette(
  videoPath: string,
  destWebpPath: string
): Promise<GeneratedThumbnailResult> {
  const hasFfmpeg = await isFfmpegAvailable()

  if (hasFfmpeg) {
    try {
      const frameBuffer = await new Promise<Buffer>((resolve, reject) => {
        const args = [
          '-ss', '00:00:01',
          '-i', videoPath,
          '-frames:v', '1',
          '-f', 'image2pipe',
          '-vcodec', 'png',
          'pipe:1',
        ]

        const proc = execFile('ffmpeg', args, { encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
          if (err) return reject(err)
          resolve(stdout)
        })

        proc.on('error', reject)
      })

      if (frameBuffer && frameBuffer.length > 0) {
        return await generateImageThumbnailAndPalette(frameBuffer, destWebpPath)
      }
    } catch {
      // Fall back to fallback poster below
    }
  }

  // Fallback: Generate an elegant dark filmstrip placeholder WebP
  const fallbackSvg = `
    <svg width="640" height="360" xmlns="http://www.w3.org/2000/svg">
      <rect width="640" height="360" fill="#18181b"/>
      <circle cx="320" cy="180" r="48" fill="#27272a"/>
      <polygon points="312,160 336,180 312,200" fill="#a1a1aa"/>
      <text x="320" y="260" font-family="sans-serif" font-size="14" fill="#71717a" text-anchor="middle">VIDEO ASSET</text>
    </svg>
  `

  const fallbackBuffer = Buffer.from(fallbackSvg)
  return await generateImageThumbnailAndPalette(fallbackBuffer, destWebpPath)
}
