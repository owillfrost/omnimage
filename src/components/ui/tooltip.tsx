import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "@/lib/utils"

const TooltipProvider = ({
  delayDuration = 200,
  skipDelayDuration = 100, // Emil Kowalski rule: skip delay on subsequent hovers
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider
    delayDuration={delayDuration}
    skipDelayDuration={skipDelayDuration}
    {...props}
  />
)

const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 overflow-hidden rounded-full border border-zinc-800 bg-zinc-900/95 px-3 py-1.5 text-xs text-zinc-200 shadow-md backdrop-blur-md transition-[opacity,transform] duration-125 ease-out",
        "data-[state=delayed-open]:opacity-100 data-[state=delayed-open]:scale-100 data-[state=closed]:opacity-0 data-[state=closed]:scale-95",
        "origin-[var(--radix-tooltip-content-transform-origin)]",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
