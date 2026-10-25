import { useState, useRef, useEffect, useCallback } from 'react'
import type { ViewportState } from '../types/artwork'

interface UseInfiniteCanvasOptions {
  friction?: number
  cullQuantizeStep?: number
  activeTab?: string
}

const DRAG_THRESHOLD = 5 // pixels movement required to distinguish dragging from clicking

export function useInfiniteCanvas({
  friction = 0.93,
  cullQuantizeStep = 130,
  activeTab,
}: UseInfiniteCanvasOptions = {}) {
  const initialX = typeof window !== 'undefined' ? window.innerWidth / 2 : 500
  const initialY = typeof window !== 'undefined' ? window.innerHeight / 2 : 400

  // Quantized viewport state used by React only to recalculate virtualized cards
  const [cullViewport, setCullViewport] = useState<ViewportState>(() => ({
    x: initialX,
    y: initialY,
    scale: 1,
  }))

  // Live 120Hz viewport coordinates applied directly to the GPU layer via worldLayerRef
  const viewportRef = useRef<ViewportState>({
    x: initialX,
    y: initialY,
    scale: 1,
  })
  const lastCulledRef = useRef<{ x: number; y: number }>({
    x: initialX,
    y: initialY,
  })
  const worldLayerRef = useRef<HTMLDivElement>(null)

  const [isDragging, setIsDragging] = useState(false)
  const isPointerDownRef = useRef(false)
  const isDraggingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Drag tracking refs
  const dragStartRef = useRef<{ x: number; y: number; viewX: number; viewY: number }>({
    x: 0,
    y: 0,
    viewX: 0,
    viewY: 0,
  })

  // Velocity tracking for physics momentum
  const velocityHistoryRef = useRef<Array<{ x: number; y: number; time: number }>>([])
  const momentumRafRef = useRef<number | null>(null)
  const pointerRafRef = useRef<number | null>(null)
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null)

  /**
   * Applies live transform directly to the DOM world layer at 120Hz and only triggers
   * a React state commit when panning exceeds cullQuantizeStep (or when forceCommit=true).
   */
  const applyViewportDirect = useCallback(
    (nextX: number, nextY: number, forceCommit = false) => {
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return

      viewportRef.current = { x: nextX, y: nextY, scale: 1 }

      if (worldLayerRef.current) {
        worldLayerRef.current.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`
      }

      const distFromLastCull = Math.hypot(
        nextX - lastCulledRef.current.x,
        nextY - lastCulledRef.current.y
      )

      if (forceCommit || distFromLastCull >= cullQuantizeStep) {
        lastCulledRef.current = { x: nextX, y: nextY }
        setCullViewport({ x: nextX, y: nextY, scale: 1 })
      }
    },
    [cullQuantizeStep]
  )

  // Ensure worldLayerRef receives the current transform whenever the canvas tab mounts/remounts
  useEffect(() => {
    if (worldLayerRef.current) {
      const { x, y } = viewportRef.current
      worldLayerRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
    }
  }, [activeTab])

  // Cancel any running momentum or pointer rAF
  const stopMomentum = useCallback(() => {
    if (momentumRafRef.current !== null) {
      cancelAnimationFrame(momentumRafRef.current)
      momentumRafRef.current = null
    }
    if (pointerRafRef.current !== null) {
      cancelAnimationFrame(pointerRafRef.current)
      pointerRafRef.current = null
    }
  }, [])

  // Programmatic viewport setter (commits immediately to both DOM and React state)
  const setViewport = useCallback(
    (
      updater:
        | ViewportState
        | ((prev: ViewportState) => ViewportState)
    ) => {
      const next =
        typeof updater === 'function' ? updater(viewportRef.current) : updater
      applyViewportDirect(next.x, next.y, true)
    },
    [applyViewportDirect]
  )

  // Start momentum physics decay
  const startMomentum = useCallback(
    (vx: number, vy: number) => {
      stopMomentum()

      let currentVx = vx
      let currentVy = vy

      const step = () => {
        currentVx *= friction
        currentVy *= friction

        // Stop when velocity is negligible and commit final position
        if (Math.abs(currentVx) < 0.05 && Math.abs(currentVy) < 0.05) {
          stopMomentum()
          applyViewportDirect(
            viewportRef.current.x,
            viewportRef.current.y,
            true
          )
          return
        }

        const nextX = viewportRef.current.x + currentVx
        const nextY = viewportRef.current.y + currentVy
        applyViewportDirect(nextX, nextY, false)

        momentumRafRef.current = requestAnimationFrame(step)
      }

      momentumRafRef.current = requestAnimationFrame(step)
    },
    [friction, stopMomentum, applyViewportDirect]
  )

  // Pointer Down handler
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only respond to left mouse button or touch
      if (e.button !== 0) return

      // Allow clicking interactive nav elements without triggering canvas drag
      const target = e.target as HTMLElement
      if (target.closest('button, a, input, [role="dialog"], [role="menu"]')) {
        return
      }

      stopMomentum()
      isPointerDownRef.current = true
      isDraggingRef.current = false
      setIsDragging(false)

      const currentView = viewportRef.current
      const safeViewX = Number.isFinite(currentView.x) ? currentView.x : 0
      const safeViewY = Number.isFinite(currentView.y) ? currentView.y : 0

      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        viewX: safeViewX,
        viewY: safeViewY,
      }

      velocityHistoryRef.current = [{ x: e.clientX, y: e.clientY, time: performance.now() }]
    },
    [stopMomentum]
  )

  // Pointer Move handler: coalesced per animation frame via worldLayerRef
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPointerDownRef.current) return

      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      const distance = Math.hypot(dx, dy)

      // Check if movement has exceeded drag threshold
      if (!isDraggingRef.current) {
        if (distance < DRAG_THRESHOLD) {
          return // Still within click threshold; do not move canvas yet
        }
        // Threshold exceeded: user is actively dragging!
        isDraggingRef.current = true
        setIsDragging(true)

        // Capture pointer so dragging remains smooth even if cursor moves outside bounds
        if (containerRef.current) {
          try {
            containerRef.current.setPointerCapture(e.pointerId)
          } catch {
            // ignore
          }
        }
      }

      const nextX = dragStartRef.current.viewX + dx
      const nextY = dragStartRef.current.viewY + dy

      pendingPointerRef.current = { x: nextX, y: nextY }
      if (pointerRafRef.current === null) {
        pointerRafRef.current = requestAnimationFrame(() => {
          pointerRafRef.current = null
          const pending = pendingPointerRef.current
          if (pending) {
            applyViewportDirect(pending.x, pending.y, false)
          }
        })
      }

      // Keep last pointer events for velocity calculation
      const now = performance.now()
      const history = velocityHistoryRef.current
      history.push({ x: e.clientX, y: e.clientY, time: now })
      if (history.length > 5) history.shift()
    },
    [applyViewportDirect]
  )

  // Pointer Up / Cancel handler
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isPointerDownRef.current) return

      const wasDragging = isDraggingRef.current
      isPointerDownRef.current = false
      isDraggingRef.current = false
      setIsDragging(false)

      if (pointerRafRef.current !== null) {
        cancelAnimationFrame(pointerRafRef.current)
        pointerRafRef.current = null
      }

      if (containerRef.current && containerRef.current.hasPointerCapture(e.pointerId)) {
        try {
          containerRef.current.releasePointerCapture(e.pointerId)
        } catch {
          // ignore
        }
      }

      // Only apply momentum if user was actively dragging
      if (wasDragging) {
        const history = velocityHistoryRef.current
        if (history.length >= 2) {
          const first = history[0]
          const last = history[history.length - 1]
          const dt = last.time - first.time

          if (dt > 10 && dt < 200) {
            const vx = ((last.x - first.x) / dt) * 16
            const vy = ((last.y - first.y) / dt) * 16

            const speed = Math.hypot(vx, vy)
            if (speed > 1.2 && Number.isFinite(speed)) {
              startMomentum(vx, vy)
              return
            }
          }
        }
        // Commit final position when drag finishes without momentum
        applyViewportDirect(
          viewportRef.current.x,
          viewportRef.current.y,
          true
        )
      }
    },
    [startMomentum, applyViewportDirect]
  )

  // Wheel handler: natural 2D scroll panning across the grid (NO zoom scale)
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      // Check if scrolling inside a modal or drawer
      const target = e.target as HTMLElement
      if (target.closest('[data-scrollable="true"], [role="dialog"]')) {
        return
      }

      e.preventDefault()
      stopMomentum()

      const nextX = viewportRef.current.x - e.deltaX
      const nextY = viewportRef.current.y - e.deltaY
      applyViewportDirect(nextX, nextY, false)
    },
    [stopMomentum, applyViewportDirect]
  )

  // Attach non-passive wheel event
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', handleWheel)
    }
  }, [handleWheel])

  // Center & Reset canvas view
  const centerView = useCallback(() => {
    stopMomentum()
    const targetX = typeof window !== 'undefined' ? window.innerWidth / 2 : 500
    const targetY = typeof window !== 'undefined' ? window.innerHeight / 2 : 400

    applyViewportDirect(targetX, targetY, true)
  }, [stopMomentum, applyViewportDirect])

  return {
    cullViewport,
    viewportRef,
    worldLayerRef,
    setViewport,
    isDragging,
    containerRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    centerView,
  }
}

