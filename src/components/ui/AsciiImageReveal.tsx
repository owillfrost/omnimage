import React, { useEffect, useRef, useState } from 'react'
import { AsciiSkeleton } from './AsciiSkeleton'
import { cn } from '@/lib/utils'

export const LOADED_IMAGE_CACHE = new Set<string>()

export interface AsciiImageRevealProps {
  src: string
  alt?: string
  className?: string
  imgClassName?: string
  aspectRatio?: number
  onLoad?: () => void
  priority?: boolean
  seed?: number
  skipReveal?: boolean
  mode?: 'default' | 'wave'
  waveDelayMs?: number
  showSkeleton?: boolean
  skeletonRows?: number
  skeletonClassName?: string
}

// Preset 'dither' original:
// Ramp: ' ░▒▓█' (onde 0 é espaço vazio e 4 é bloco cheio)
const RAMP = [' ', '\u2591', '\u2592', '\u2593', '\u2588']
const CELL_STEPS = [18, 13, 9, 7] // Do mais pixelado/abstrato para o mais refinado

export const AsciiImageReveal: React.FC<AsciiImageRevealProps> = ({
  src,
  alt = '',
  className = '',
  imgClassName = '',
  onLoad,
  seed = 42,
  skipReveal = false,
  mode = 'default',
  showSkeleton = true,
  skeletonRows = 24,
  skeletonClassName = '',
}) => {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(() =>
    LOADED_IMAGE_CACHE.has(src) ? src : null
  )
  if (LOADED_IMAGE_CACHE.has(src) && loadedSrc !== src) {
    setLoadedSrc(src)
  }
  const isLoaded = loadedSrc === src
  const [isRevealing, setIsRevealing] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const animFrameRef = useRef<number | null>(null)

  const isWaveMode = mode === 'wave'

  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [])

  const startReveal = () => {
    LOADED_IMAGE_CACHE.add(src)
    setLoadedSrc(src)
    onLoad?.()

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    // Se já estiver em cache, se preferir movimento reduzido ou se for modo onda, pular animação dither
    if (skipReveal || isWaveMode || prefersReducedMotion) {
      return
    }

    const img = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas) return

    const rect = canvas.getBoundingClientRect()
    const w = Math.floor(rect.width)
    const h = Math.floor(rect.height)
    if (w <= 0 || h <= 0) return

    // DPR limitado para manter performance suave mesmo em telas Retina
    const dpr = Math.min(1.25, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Amostragem ultrarrápida usando canvas offscreen de baixa resolução (L1/L2 cache friendly)
    const sampleW = Math.min(64, Math.max(16, Math.floor(w / 4)))
    const sampleH = Math.min(64, Math.max(16, Math.floor(h / 4)))
    const sampleCanvas = document.createElement('canvas')
    sampleCanvas.width = sampleW
    sampleCanvas.height = sampleH
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true })
    if (!sampleCtx) return

    try {
      sampleCtx.drawImage(img, 0, 0, sampleW, sampleH)
    } catch {
      // Fallback gracioso para restrição cross-origin
      setIsRevealing(false)
      return
    }

    let imgData: ImageData
    try {
      imgData = sampleCtx.getImageData(0, 0, sampleW, sampleH)
    } catch {
      setIsRevealing(false)
      return
    }

    setIsRevealing(true)

    const duration = 580 // ms de duração da decodificação em dither
    const startTime = performance.now()
    const pixels = imgData.data

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration)

      // Índice de refinamento dos glifos
      const stepIdx = Math.min(
        CELL_STEPS.length - 1,
        Math.floor(progress * CELL_STEPS.length)
      )
      const cellSize = CELL_STEPS[stepIdx]
      const cellW = cellSize * 0.65
      const cols = Math.ceil(w / cellW)
      const rows = Math.ceil(h / cellSize)

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.font = `${Math.round(cellSize * 1.05)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      // Revela em onda radial do centro para as bordas + jitter de dither
      const centerX = w / 2
      const centerY = h / 2
      const maxDist = Math.hypot(centerX, centerY)

      // Fade da imagem real no terço final da decodificação
      const revealFade = progress > 0.65 ? (progress - 0.65) / 0.35 : 0

      for (let r = 0; r < rows; r++) {
        const py = Math.floor((r + 0.5) * cellSize)
        if (py >= h) continue
        const sy = Math.min(sampleH - 1, Math.floor((py / h) * sampleH))

        for (let c = 0; c < cols; c++) {
          const px = Math.floor((c + 0.5) * cellW)
          if (px >= w) continue
          const sx = Math.min(sampleW - 1, Math.floor((px / w) * sampleW))

          const dist = Math.hypot(px - centerX, py - centerY) / maxDist
          const jitter = ((seed + r * 13 + c * 37) % 100) / 400
          const localProgress = Math.max(0, Math.min(1, (progress - (dist * 0.45 + jitter)) / 0.5))

          if (localProgress >= 1 && revealFade > 0.8) {
            continue
          }

          const pIdx = (sy * sampleW + sx) * 4
          const red = pixels[pIdx]
          const green = pixels[pIdx + 1]
          const blue = pixels[pIdx + 2]
          const lum = (0.299 * red + 0.587 * green + 0.114 * blue) / 255

          // Mapeia luminosidade para a rampa dither: ' ░▒▓█'
          const rampIndex = Math.min(
            RAMP.length - 1,
            Math.max(1, Math.floor(lum * (RAMP.length - 1) + (localProgress * 0.5)))
          )
          const glyph = RAMP[rampIndex]

          // Cores quantizadas (passo 16) para reduzir consumo de string no context2d
          const qr = (red >> 4) << 4
          const qg = (green >> 4) << 4
          const qb = (blue >> 4) << 4
          const alpha = Math.max(0, 1 - revealFade * 0.8)

          ctx.fillStyle = `rgba(${qr},${qg},${qb},${alpha.toFixed(2)})`
          ctx.fillText(glyph, px, py)
        }
      }

      ctx.restore()

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(tick)
      } else {
        setIsRevealing(false)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }

    animFrameRef.current = requestAnimationFrame(tick)
  }

  return (
    <div className={cn("relative w-full h-full overflow-hidden", className)}>
      {/* 1. Placeholder do modo wave (GPU sliding beam) */}
      {isWaveMode && !isLoaded && (
        <div className="anchor-wave-placeholder" />
      )}

      {/* 2. Skeleton ASCII Dither integrado com fade-out suave */}
      {showSkeleton && !isWaveMode && (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-300 ease-out pointer-events-none overflow-hidden bg-zinc-950/80 flex items-center justify-center text-zinc-600 z-[1]",
            isLoaded ? "opacity-0" : "opacity-100",
            skeletonClassName
          )}
        >
          <AsciiSkeleton
            rows={skeletonRows}
            seed={seed}
            className="w-full h-full text-zinc-500/70"
          />
        </div>
      )}

      {/* 3. Imagem real — sem crossOrigin para aproveitar o cache de disco unificado */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        decoding="async"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onLoad={startReveal}
        className={cn(
          "w-full h-full object-cover select-none pointer-events-none transition-opacity duration-300",
          isWaveMode && "anchor-wave-image-reveal",
          isLoaded ? "opacity-100" : "opacity-0",
          imgClassName
        )}
      />

      {/* 4. Canvas de decodificação ASCII — sempre montado para garantir existência do ref */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={cn(
          "absolute inset-0 w-full h-full pointer-events-none z-10 transition-opacity duration-150",
          isRevealing ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  )
}
