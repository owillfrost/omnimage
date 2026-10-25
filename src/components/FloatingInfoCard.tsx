import * as React from "react"
import { ChevronUp, X, FolderOpen } from "lucide-react"

interface FloatingInfoCardProps {
  isEagleConnected?: boolean
  totalCount?: number
  currentLibraryName?: string
}

export const FloatingInfoCard: React.FC<FloatingInfoCardProps> = React.memo(({
  isEagleConnected,
  totalCount,
  currentLibraryName = "Design",
}) => {
  const [isExpanded, setIsExpanded] = React.useState(true)

  return (
    <aside className="fixed bottom-6 left-6 z-30 pointer-events-none max-w-sm w-[calc(100vw-3rem)]">
      <div className="pointer-events-auto bg-zinc-950/90 backdrop-blur-2xl border border-zinc-800/90 rounded-[28px] overflow-hidden shadow-2xl transition-[all] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]">
        {/* Card Header & Toggle */}
        <div className="p-5 flex items-center justify-between border-b border-zinc-800/50 bg-zinc-900/40">
          <div className="flex items-center gap-2.5">
            <div className="bg-zinc-800 border border-zinc-700/60 rounded-full px-3 py-1 flex items-center gap-1.5 shadow-sm">
              <span
                className={`w-2 h-2 rounded-full ${
                  isEagleConnected ? "bg-blue-400" : "bg-amber-400 animate-pulse"
                }`}
              />
              <span className="text-xs font-bold tracking-wider text-zinc-100 uppercase">
                {isEagleConnected ? "Gallery" : "Conectando"}
              </span>
            </div>
            <span className="text-[11px] text-zinc-400 font-medium">Omnimage</span>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all active:scale-95 cursor-pointer"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <X className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Expandable Body */}
        {isExpanded && (
          <div className="p-5 space-y-4 animate-in fade-in-50 zoom-in-95 duration-200">
            {isEagleConnected ? (
              <>
                <p className="text-xs leading-relaxed text-zinc-300">
                  Visualizando sua biblioteca local (
                  <span className="text-white font-medium">{currentLibraryName}</span>) conectada em tempo real.
                </p>

                <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                      Biblioteca Conectada
                    </span>
                    <span className="text-[10px] text-blue-400 font-mono">
                      {totalCount} ITENS
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    Arraste a tela livremente. As imagens e miniaturas locais são transmitidas com zero perda e suporte a filtro cromático por IA.
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs leading-relaxed text-zinc-300">
                  Conectando à sua biblioteca local (
                  <span className="text-white font-medium">{currentLibraryName}</span>)...
                </p>

                <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                      Carregando
                    </span>
                    <span className="text-[10px] text-amber-400 font-mono">AGUARDE</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    Lendo arquivos locais no disco e sincronizando metadados.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  )
})

