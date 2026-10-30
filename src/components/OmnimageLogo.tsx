import * as React from "react"
import { cn } from "@/lib/utils"

export interface OmnimageLogoProps {
  className?: string
  size?: number
  interactive?: boolean
}

export const OmnimageLogo: React.FC<OmnimageLogoProps> = ({
  className,
  size = 26,
  interactive = true,
}) => {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center",
        interactive ? "cursor-pointer group" : "cursor-default select-none pointer-events-none",
        className
      )}
      style={{ width: size, height: size }}
      title={interactive ? "Omnimage" : undefined}
      role={interactive ? undefined : "status"}
      aria-label={interactive ? undefined : "Carregando..."}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn(
          "transition-transform duration-300 ease-out",
          interactive && "group-hover:opacity-100"
        )}
      >
        {/* Hexagonal constellation dots */}
        <circle cx="16" cy="6" r="2.2" className="fill-white animate-pulse" style={{ animationDelay: '0ms' }} />
        <circle cx="24.66" cy="11" r="2.2" className="fill-white animate-pulse" style={{ animationDelay: '150ms' }} />
        <circle cx="24.66" cy="21" r="2.2" className="fill-white animate-pulse" style={{ animationDelay: '300ms' }} />
        <circle cx="16" cy="26" r="2.2" className="fill-white animate-pulse" style={{ animationDelay: '450ms' }} />
        <circle cx="7.34" cy="21" r="2.2" className="fill-white animate-pulse" style={{ animationDelay: '600ms' }} />
        <circle cx="7.34" cy="11" r="2.2" className="fill-white animate-pulse" style={{ animationDelay: '750ms' }} />

        {/* Faint connecting lines */}
        <path
          d="M16 6 L24.66 11 L24.66 21 L16 26 L7.34 21 L7.34 11 Z"
          stroke="rgba(255, 255, 255, 0.25)"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
      </svg>
    </div>
  )
}
