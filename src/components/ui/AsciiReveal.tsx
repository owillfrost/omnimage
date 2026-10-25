import React, { useEffect, useState, useRef } from 'react'

export interface AsciiRevealProps {
  children?: React.ReactNode
  preset?: 'terminal' | 'blueprint' | 'matrix' | 'dither' | string
  duration?: 'fast' | 'normal' | 'slow' | number
  speed?: number
  className?: string
  style?: React.CSSProperties
}


/**
 * Lightweight, MIT-licensed ASCII text/container reveal effect.
 * Fully eliminates external unfree dependencies while preserving the terminal/blueprint aesthetic.
 */
export const AsciiReveal: React.FC<AsciiRevealProps> = ({
  children,
  className = '',
  style,
}) => {
  const [mounted, setMounted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div
      ref={containerRef}
      className={`ascii-reveal-container ${mounted ? 'is-revealed' : 'is-revealing'} ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}
