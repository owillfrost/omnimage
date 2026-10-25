import * as React from 'react'
import { Play } from 'lucide-react'
import type { Artwork } from '../types/artwork'
import { formatVideoDuration, isVideoArtwork } from '../core/mediaUtils'
import { cn } from '@/lib/utils'

export interface MotionVideoPreviewProps {
  artwork: Artwork
  isHoverDisabled?: boolean
  className?: string
  showBadge?: boolean
  badgePosition?: 'bottom-left' | 'top-left' | 'bottom-right'
  onVideoActiveChange?: (isActive: boolean) => void
}

const HOVER_DELAY_MS = 350

export const MotionVideoPreview: React.FC<MotionVideoPreviewProps> = ({
  artwork,
  isHoverDisabled = false,
  className,
  showBadge = true,
  badgePosition = 'bottom-left',
  onVideoActiveChange,
}) => {
  const isVideo = isVideoArtwork(artwork)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const videoRef = React.useRef<HTMLVideoElement | null>(null)

  const [isHovered, setIsHovered] = React.useState(false)
  const [isVideoMounted, setIsVideoMounted] = React.useState(false)
  const [isVideoReady, setIsVideoReady] = React.useState(false)
  const [duration, setDuration] = React.useState<number>(artwork.duration || 0)
  const [currentTime, setCurrentTime] = React.useState<number>(0)
  const [progressRatio, setProgressRatio] = React.useState<number>(0)
  const [isScrubbing, setIsScrubbing] = React.useState(false)

  const hoverTimerRef = React.useRef<number | null>(null)
  const scrubThrottleRef = React.useRef<number | null>(null)
  const scrubIdleTimerRef = React.useRef<number | null>(null)

  // Notify parent of active video state for coordination
  React.useEffect(() => {
    onVideoActiveChange?.(isVideoMounted)
  }, [isVideoMounted, onVideoActiveChange])

  // Safely cleanup video and release VRAM immediately
  const cleanupVideo = React.useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    if (scrubThrottleRef.current !== null) {
      cancelAnimationFrame(scrubThrottleRef.current)
      scrubThrottleRef.current = null
    }
    if (scrubIdleTimerRef.current !== null) {
      window.clearTimeout(scrubIdleTimerRef.current)
      scrubIdleTimerRef.current = null
    }

    if (videoRef.current) {
      try {
        videoRef.current.pause()
        videoRef.current.removeAttribute('src')
        videoRef.current.load()
      } catch {
        // ignore cleanup error
      }
    }

    setIsHovered(false)
    setIsVideoMounted(false)
    setIsVideoReady(false)
    setIsScrubbing(false)
    setProgressRatio(0)
    setCurrentTime(0)
  }, [])

  // If hover is externally disabled (e.g., canvas pan started), cleanup immediately
  React.useEffect(() => {
    if (isHoverDisabled && (isVideoMounted || hoverTimerRef.current !== null)) {
      cleanupVideo()
    }
  }, [isHoverDisabled, isVideoMounted, cleanupVideo])

  // Clean up on component unmount
  React.useEffect(() => {
    return () => {
      cleanupVideo()
    }
  }, [cleanupVideo])

  if (!isVideo) {
    return null
  }

  const handlePointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || isHoverDisabled) return
    setIsHovered(true)

    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current)
    }

    // Mount video only after 350ms of stationary hover
    hoverTimerRef.current = window.setTimeout(() => {
      setIsVideoMounted(true)
      hoverTimerRef.current = null
    }, HOVER_DELAY_MS)
  }

  const handlePointerLeave = () => {
    cleanupVideo()
  }

  const handlePointerDown = () => {
    // When pointer goes down (potential pan or click), unmount video immediately
    cleanupVideo()
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isVideoMounted || isHoverDisabled || e.pointerType === 'touch') return

    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    if (rect.width <= 0) return

    const relativeX = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
    const ratio = relativeX / rect.width

    setIsScrubbing(true)
    setProgressRatio(ratio)

    if (scrubIdleTimerRef.current !== null) {
      window.clearTimeout(scrubIdleTimerRef.current)
    }
    // Resume playback if pointer stays still for 200ms
    scrubIdleTimerRef.current = window.setTimeout(() => {
      setIsScrubbing(false)
      if (videoRef.current && isVideoReady) {
        void videoRef.current.play().catch(() => {})
      }
    }, 200)

    if (scrubThrottleRef.current !== null) return
    scrubThrottleRef.current = requestAnimationFrame(() => {
      scrubThrottleRef.current = null
      const video = videoRef.current
      if (video && Number.isFinite(video.duration) && video.duration > 0) {
        const targetTime = ratio * video.duration
        video.currentTime = targetTime
        setCurrentTime(targetTime)
      }
    })
  }

  const handleLoadedMetadata = () => {
    const video = videoRef.current
    if (!video) return
    if (Number.isFinite(video.duration) && video.duration > 0) {
      setDuration(video.duration)
    }
    void video.play().catch(() => {})
  }

  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (!video || isScrubbing) return
    setCurrentTime(video.currentTime)
    if (video.duration > 0) {
      setProgressRatio(video.currentTime / video.duration)
    }
  }

  const badgeDurationText = formatVideoDuration(duration || artwork.duration)

  const badgePositionClass =
    badgePosition === 'top-left'
      ? 'top-2.5 left-2.5'
      : badgePosition === 'bottom-right'
      ? 'bottom-2.5 right-2.5'
      : 'bottom-2.5 left-2.5'

  return (
    <div
      ref={containerRef}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      className={cn("absolute inset-0 z-10 overflow-hidden pointer-events-auto", className)}
    >
      {/* Mounted Native Video with Scrubbing */}
      {isVideoMounted && (
        <video
          ref={videoRef}
          src={artwork.imageUrl}
          muted
          loop
          playsInline
          preload="auto"
          onLoadedMetadata={handleLoadedMetadata}
          onCanPlay={() => setIsVideoReady(true)}
          onTimeUpdate={handleTimeUpdate}
          className={cn(
            "absolute inset-0 w-full h-full object-cover select-none pointer-events-none transition-opacity duration-200",
            isVideoReady ? "opacity-100" : "opacity-0"
          )}
        />
      )}

      {/* Scrubbing & Motion Timeline Bar */}
      {isVideoMounted && isVideoReady && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end p-2 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-300 mb-1 px-0.5">
            <span className="flex items-center gap-1 font-semibold text-white drop-shadow">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              {isScrubbing ? 'Scrub' : 'Play'}
            </span>
            <span className="text-zinc-200 drop-shadow">
              {formatVideoDuration(currentTime)} / {badgeDurationText || formatVideoDuration(duration)}
            </span>
          </div>

          {/* Progress Bar Track */}
          <div className="relative w-full h-1 bg-white/20 rounded-full overflow-hidden backdrop-blur-xs">
            <div
              className="absolute left-0 top-0 bottom-0 bg-amber-400 rounded-full transition-[width] duration-75"
              style={{ width: `${Math.max(0, Math.min(100, progressRatio * 100))}%` }}
            />
          </div>
        </div>
      )}

      {/* Idle / Default Video Badge */}
      {showBadge && !isVideoMounted && (
        <div
          className={cn(
            "absolute z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/75 hover:bg-black/90 border border-white/15 text-white text-[10px] font-mono font-medium shadow-md backdrop-blur-md transition-all duration-200 pointer-events-none",
            badgePositionClass,
            isHovered && "scale-105 border-amber-400/50 text-amber-200"
          )}
        >
          <Play className="w-2.5 h-2.5 fill-current shrink-0 text-amber-400" />
          <span>{badgeDurationText || 'VÍDEO'}</span>
        </div>
      )}
    </div>
  )
}
