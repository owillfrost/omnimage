import type { Artwork } from '../types/artwork'

export type MediaTypeFilter = 'all' | 'video' | 'image'

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov'])

/**
 * Robustly checks if an artwork item represents a video asset.
 */
export function isVideoArtwork(
  artwork?: Partial<Artwork> | { mediaType?: string; medium?: string; ext?: string } | null
): boolean {
  if (!artwork) return false
  if (artwork.mediaType === 'video') return true
  if (artwork.mediaType === 'image') return false
  if (artwork.ext && VIDEO_EXTENSIONS.has(artwork.ext.toLowerCase())) return true
  if (artwork.medium && /^(MP4|WEBM|MOV)/i.test(artwork.medium)) return true
  return false
}

/**
 * Formats a duration in seconds to standard digital timecode string:
 * - 4.5 -> "0:04"
 * - 65 -> "1:05"
 * - 3610 -> "1:00:10"
 */
export function formatVideoDuration(seconds?: number | null): string {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) return ''
  const totalSecs = Math.floor(seconds)
  const hours = Math.floor(totalSecs / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Filters artworks by media type.
 */
export function matchesMediaTypeFilter(artwork: Artwork, filter: MediaTypeFilter): boolean {
  if (filter === 'all') return true
  const isVideo = isVideoArtwork(artwork)
  if (filter === 'video') return isVideo
  if (filter === 'image') return !isVideo
  return true
}
