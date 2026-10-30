import * as React from "react"
import { Loader2, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface IndexerStatus {
  status: 'idle' | 'indexing' | 'completed' | 'error'
  engine?: string
  processed: number
  total: number
  currentFileName?: string
  rateImgPerSec?: number
}

export interface IndexerStatusPillProps {
  status?: IndexerStatus
  className?: string
}

export const IndexerStatusPill: React.FC<IndexerStatusPillProps> = ({
  status: initialStatus,
  className,
}) => {
  const [liveStatus, setLiveStatus] = React.useState<IndexerStatus>(
    initialStatus || { status: 'idle', processed: 0, total: 0 }
  )

  React.useEffect(() => {
    if (initialStatus) {
      setLiveStatus(initialStatus)
      return
    }

    let active = true
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/catalog/indexer-status')
        if (res.ok) {
          const json = await res.json()
          if (active && json.status === 'success' && json.data) {
            setLiveStatus({
              status: json.data.state === 'indexing' ? 'indexing' : 'idle',
              engine: json.data.engine,
              processed: json.data.processed,
              total: json.data.total,
              rateImgPerSec: json.data.rateImgPerSec,
            })
          }
        }
      } catch {
        // ignore
      }
    }

    const interval = setInterval(checkStatus, 2500)
    checkStatus()

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [initialStatus])

  if (liveStatus.status === 'idle' || liveStatus.total === 0) {
    return null
  }

  const isRunning = liveStatus.status === 'indexing'
  const isDone = liveStatus.status === 'completed'

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono backdrop-blur-xl border shadow-xl transition-all select-none",
        isRunning && "bg-amber-500/10 border-amber-500/30 text-amber-300",
        isDone && "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
        className
      )}
    >
      {isRunning ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
          <span>
            {liveStatus.engine === 'embeddinggemma-2' ? 'Gemma 2' : 'CLIP'} Indexer: {liveStatus.processed}/{liveStatus.total}
            {liveStatus.rateImgPerSec ? ` (${liveStatus.rateImgPerSec} img/s)` : ''}
          </span>
        </>
      ) : (
        <>
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span>{liveStatus.total} embeddings prontos</span>
        </>
      )}
    </div>
  )
}
