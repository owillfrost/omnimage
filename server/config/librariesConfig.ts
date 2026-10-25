import path from 'node:path'
import fs from 'node:fs'

export interface LibraryConfigEntry {
  id: string
  name: string
  path: string
  sourceFolderPath?: string
  type: 'eagle-library' | 'native-folder'
  hidden?: boolean
}

const DEFAULT_LIBRARIES: LibraryConfigEntry[] = [
  {
    id: 'design',
    name: 'Design.library',
    path: './libraries/Design.library',
    type: 'eagle-library',
  },
  {
    id: 'google-flow',
    name: 'Google Flow + Prompts',
    path: './libraries/Prompts.library',
    type: 'eagle-library',
  },
]

export function getLibrariesConfig(): LibraryConfigEntry[] {
  const omnimageConfig = path.resolve(process.cwd(), '.omnimage/libraries.json')
  const legacyConfig = path.resolve(process.cwd(), '.cosmos/libraries.json')
  const configFile = fs.existsSync(omnimageConfig) ? omnimageConfig : legacyConfig
  if (fs.existsSync(configFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
      if (Array.isArray(data) && data.length > 0) {
        return data
      }
    } catch {
      // fallback
    }
  }
  return DEFAULT_LIBRARIES
}

export function saveLibrariesConfig(libraries: LibraryConfigEntry[]): void {
  const omnimageDir = path.resolve(process.cwd(), '.omnimage')
  if (!fs.existsSync(omnimageDir)) {
    fs.mkdirSync(omnimageDir, { recursive: true })
  }
  fs.writeFileSync(
    path.join(omnimageDir, 'libraries.json'),
    JSON.stringify(libraries, null, 2),
    'utf-8'
  )
}
