import * as React from 'react'

export type SkeletonVariant = 'default' | 'dense' | 'sparse'

export interface AsciiSkeletonProps {
  rows?: number
  cols?: number
  seed?: number
  variant?: SkeletonVariant
  className?: string
  style?: React.CSSProperties
}

export type AsciiDitherSkeletonProps = AsciiSkeletonProps

const PATTERNS = [
  '░░▒▒▓▓██▓▓▒▒░░',
  '·:·:·:·:·:·:·:',
  '┌───┐┌───┐┌───┐',
  '▒▓█▓▒░▒▓█▓▒░▒▓█',
  '· . + * # @ % =',
]

export const AsciiSkeleton: React.FC<AsciiSkeletonProps> = ({
  rows = 16,
  className = '',
  style,
}) => {
  const lineCount = Math.max(4, Math.min(64, rows))

  return (
    <div
      aria-hidden="true"
      className={`skeleton-shimmer flex flex-col justify-center items-center overflow-hidden font-mono text-[9px] leading-[11px] text-zinc-700/60 select-none ${className}`}
      style={style}
    >
      {Array.from({ length: lineCount }).map((_, i) => (
        <div key={i} className="truncate tracking-wider opacity-60">
          {PATTERNS[i % PATTERNS.length]}
        </div>
      ))}
    </div>
  )
}
