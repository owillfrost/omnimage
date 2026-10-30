import type { IEmbeddingEngine } from './types'
import { ClipVitB32Engine } from './clipVitB32Engine'
import { getEmbeddingConfig, type EmbeddingEngineType } from '../../config/embeddingConfig'

const engineInstances = new Map<string, IEmbeddingEngine>()

export async function getEmbeddingEngine(overrideEngine?: EmbeddingEngineType): Promise<IEmbeddingEngine> {
  const config = getEmbeddingConfig()
  const engineType = overrideEngine || config.engine

  if (engineInstances.has(engineType)) {
    return engineInstances.get(engineType)!
  }

  let engine: IEmbeddingEngine

  switch (engineType) {
    case 'embeddinggemma-2': {
      // Lazy dynamic import: if not selected, this file/weights are NEVER loaded or parsed
      const { Gemma2Engine } = await import('./gemma2Engine')
      engine = new Gemma2Engine(config.device)
      break
    }
    case 'clip-vit-b32':
    default: {
      engine = new ClipVitB32Engine()
      break
    }
  }

  engineInstances.set(engineType, engine)
  return engine
}
