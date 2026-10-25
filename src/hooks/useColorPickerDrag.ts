import * as React from 'react'
import { clamp } from '../core/colorConversion'

interface UseColorPickerDragOptions {
  hsv: [number, number, number]
  onHsvChange: (nextHsv: [number, number, number]) => void
}

/**
 * Encapsulates pointer capture and coordinate normalization for 2D Saturation/Value
 * and 1D Hue sliders in MultiColorPickerPopover.
 */
export function useColorPickerDrag({ hsv, onHsvChange }: UseColorPickerDragOptions) {
  const svBoxRef = React.useRef<HTMLDivElement | null>(null)
  const hueBarRef = React.useRef<HTMLDivElement | null>(null)

  const updateSvFromPointer = React.useCallback(
    (clientX: number, clientY: number) => {
      const el = svBoxRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const s = clamp((clientX - rect.left) / rect.width, 0, 1)
      const v = clamp(1 - (clientY - rect.top) / rect.height, 0, 1)
      onHsvChange([hsv[0], s, v])
    },
    [hsv, onHsvChange]
  )

  const updateHueFromPointer = React.useCallback(
    (clientX: number) => {
      const el = hueBarRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
      const h = Math.round(ratio * 360)
      onHsvChange([h, hsv[1], hsv[2]])
    },
    [hsv, onHsvChange]
  )

  const handleSvPointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      updateSvFromPointer(e.clientX, e.clientY)
    },
    [updateSvFromPointer]
  )

  const handleSvPointerMove = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
      updateSvFromPointer(e.clientX, e.clientY)
    },
    [updateSvFromPointer]
  )

  const handleSvPointerUp = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    },
    []
  )

  const handleHuePointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      updateHueFromPointer(e.clientX)
    },
    [updateHueFromPointer]
  )

  const handleHuePointerMove = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
      updateHueFromPointer(e.clientX)
    },
    [updateHueFromPointer]
  )

  const handleHuePointerUp = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    },
    []
  )

  return {
    svBoxRef,
    hueBarRef,
    handleSvPointerDown,
    handleSvPointerMove,
    handleSvPointerUp,
    handleHuePointerDown,
    handleHuePointerMove,
    handleHuePointerUp,
  }
}
