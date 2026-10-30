import * as React from 'react'
import { Cpu, Zap, Check, Sparkles, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { cn } from '@/lib/utils'

export interface ModelSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
}

export interface EmbeddingConfigData {
  engine: 'clip-vit-b32' | 'embeddinggemma-2'
  device: 'cpu' | 'directml' | 'cuda' | 'auto'
}

export const ModelSettingsModal: React.FC<ModelSettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [config, setConfig] = React.useState<EmbeddingConfigData>({
    engine: 'clip-vit-b32',
    device: 'auto',
  })
  const [isSaving, setIsSaving] = React.useState(false)
  const [saveSuccess, setSaveSuccess] = React.useState(false)

  React.useEffect(() => {
    if (isOpen) {
      setSaveSuccess(false)
      fetch('/api/catalog/embedding-config')
        .then((res) => res.json())
        .then((res) => {
          if (res.status === 'success' && res.data) {
            setConfig(res.data)
          }
        })
        .catch(() => {})
    }
  }, [isOpen])

  const handleSelectEngine = async (engine: 'clip-vit-b32' | 'embeddinggemma-2') => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/catalog/embedding-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine,
          device: engine === 'embeddinggemma-2' ? 'directml' : 'auto',
        }),
      })
      if (res.ok) {
        setConfig((prev) => ({
          ...prev,
          engine,
          device: engine === 'embeddinggemma-2' ? 'directml' : 'auto',
        }))
        setSaveSuccess(true)
        onSaved?.()
        setTimeout(() => setSaveSuccess(false), 2000)
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 sm:max-w-lg p-6">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-zinc-300" />
            <span>Motor de Busca Semântica por IA</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400 leading-relaxed">
            Escolha o modelo neural local para busca textual e visual. Nenhum modelo é executado na nuvem: tudo roda na sua própria máquina.
          </DialogDescription>
        </DialogHeader>

        <div className={cn('grid grid-cols-1 gap-3 py-3', isSaving && 'pointer-events-none opacity-50')}>
          {/* Option 1: CLIP ViT-B/32 */}
          <div
            onClick={() => handleSelectEngine('clip-vit-b32')}
            className={cn(
              'p-4 rounded-2xl border transition-all cursor-pointer relative flex flex-col gap-2',
              config.engine === 'clip-vit-b32'
                ? 'bg-zinc-900 border-zinc-500 shadow-sm'
                : 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/60'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-zinc-400" />
                <span className="font-semibold text-xs text-zinc-200">CLIP ViT-B/32 (Padrão)</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium">
                Padrão Leve
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-normal">
              Ideal para qualquer PC ou CPU sem placa de vídeo. Indexação rápida e baixo consumo de RAM (~350 MB). Melhor desempenho em palavras-chave em inglês.
            </p>
            {config.engine === 'clip-vit-b32' && (
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-200 mt-1">
                <Check className="w-3.5 h-3.5 text-zinc-300" />
                <span>Ativo</span>
              </div>
            )}
          </div>

          {/* Option 2: EmbeddingGemma 2 */}
          <div
            onClick={() => handleSelectEngine('embeddinggemma-2')}
            className={cn(
              'p-4 rounded-2xl border transition-all cursor-pointer relative flex flex-col gap-2',
              config.engine === 'embeddinggemma-2'
                ? 'bg-zinc-900 border-zinc-500 shadow-sm'
                : 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/60'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-zinc-400" />
                <span className="font-semibold text-xs text-zinc-200">
                  EmbeddingGemma 2 (Pro Neural 512D)
                </span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-medium">
                Extra Opcional
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-normal">
              Modelo multimodal do Google de última geração. Compreende perfeitamente frases e descrições conceituais em <strong className="text-zinc-200">Português</strong>. Acelerado na sua GPU (DirectML / RTX 5050).
            </p>
            <div className="flex items-center justify-between mt-1 text-[10px] text-zinc-500">
              <span>Dim: 512d (MRL)</span>
              <span>DirectML GPU Acelerado</span>
            </div>
            {config.engine === 'embeddinggemma-2' && (
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-200 mt-1">
                <Check className="w-3.5 h-3.5 text-zinc-300" />
                <span>Ativo (Índices em .gemma2.bin)</span>
              </div>
            )}
          </div>
        </div>

        {/* Note / Tip */}
        <div className="p-3 rounded-xl bg-zinc-900/30 border border-zinc-800/60 text-[11px] text-zinc-400 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Dica: Para indexar sua biblioteca inteira com a GPU em lote usando Gemma 2, você também pode executar <code className="text-zinc-200 font-mono bg-zinc-800/80 px-1 py-0.5 rounded">npm run index:gemma2</code> no terminal.
          </p>
        </div>

        {saveSuccess && (
          <div className="text-xs text-emerald-400 text-center font-mono py-1">
            ✓ Configuração atualizada com sucesso!
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
