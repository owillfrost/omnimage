import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-[transform,background-color,border-color,color,opacity] duration-150 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-white text-zinc-950 shadow hover:bg-zinc-200 active:bg-zinc-300",
        destructive:
          "bg-red-500 text-white shadow-sm hover:bg-red-600",
        outline:
          "border border-zinc-800 bg-zinc-900/60 backdrop-blur-md text-zinc-200 hover:bg-zinc-800 hover:text-white hover:border-zinc-700",
        secondary:
          "bg-zinc-800/80 text-zinc-200 hover:bg-zinc-700 active:bg-zinc-600",
        ghost:
          "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50",
        link:
          "text-zinc-300 underline-offset-4 hover:underline",
        pill:
          "border border-zinc-800 bg-zinc-950/80 backdrop-blur-xl text-zinc-300 hover:text-white hover:border-zinc-700 shadow-lg",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10 p-0 rounded-full",
        "icon-sm": "h-8 w-8 p-0 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
