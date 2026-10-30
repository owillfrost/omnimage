import path from 'node:path'
import fs from 'node:fs'

export type EmbeddingEngineType = 'clip-vit-b32' | 'embeddinggemma-2'

export interface EmbeddingEngineConfig {
  engine: EmbeddingEngineType
  device?: 'cpu' | 'directml' | 'cuda' | 'auto'
}

export const DEFAULT_EMBEDDING_CONFIG: EmbeddingEngineConfig = {
  engine: 'clip-vit-b32',
  device: 'auto',
}

export function getEmbeddingConfig(): EmbeddingEngineConfig {
  // 1. Environment variable override (handy for scripts or testing)
  const envEngine = process.env.OMNIMAGE_EMBEDDING_ENGINE
  if (envEngine === 'embeddinggemma-2' || envEngine === 'clip-vit-b32') {
    return {
      engine: envEngine,
      device: (process.env.OMNIMAGE_DEVICE as any) || 'auto',
    }
  }

  // 2. Settings JSON in .omnimage/settings.json
  const omnimageDir = path.resolve(process.cwd(), '.omnimage')
  const settingsFile = path.join(omnimageDir, 'settings.json')
  if (fs.existsSync(settingsFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'))
      if (data.embeddingEngine === 'embeddinggemma-2' || data.embeddingEngine === 'clip-vit-b32') {
        return {
          engine: data.embeddingEngine,
          device: data.embeddingDevice || 'auto',
        }
      }
    } catch {
      // fallback to default
    }
  }

  return { ...DEFAULT_EMBEDDING_CONFIG }
}

export function saveEmbeddingConfig(config: Partial<EmbeddingEngineConfig>): EmbeddingEngineConfig {
  const current = getEmbeddingConfig()
  const updated: EmbeddingEngineConfig = {
    ...current,
    ...config,
  }

  const omnimageDir = path.resolve(process.cwd(), '.omnimage')
  if (!fs.existsSync(omnimageDir)) {
    fs.mkdirSync(omnimageDir, { recursive: true })
  }

  const settingsFile = path.join(omnimageDir, 'settings.json')
  let existingSettings: Record<string, any> = {}
  if (fs.existsSync(settingsFile)) {
    try {
      existingSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'))
    } catch {
      existingSettings = {}
    }
  }

  existingSettings.embeddingEngine = updated.engine
  existingSettings.embeddingDevice = updated.device

  fs.writeFileSync(settingsFile, JSON.stringify(existingSettings, null, 2), 'utf-8')
  return updated
}
