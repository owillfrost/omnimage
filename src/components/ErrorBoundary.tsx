import * as React from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"

export interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode)
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  name?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ""}] caught error:`, error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  override render() {
    if (this.state.hasError && this.state.error) {
      if (typeof this.props.fallback === "function") {
        return this.props.fallback(this.state.error, this.handleReset)
      }
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[140px] p-4 m-2 rounded-2xl bg-zinc-950/90 border border-red-500/30 text-zinc-200 text-center space-y-3 shadow-xl backdrop-blur-md">
          <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-xs font-semibold text-zinc-100">
              {this.props.name ? `Erro em ${this.props.name}` : "Erro de Renderização"}
            </h3>
            <p className="text-[11px] text-zinc-400 font-mono line-clamp-2">
              {this.state.error.message || "Ocorreu um erro inesperado."}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-medium border border-zinc-700/60 hover:border-zinc-500 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
            <span>Tentar Novamente</span>
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
