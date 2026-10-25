import fs from 'node:fs'
import zlib from 'node:zlib'
import type { ComfyMetadata } from '../../src/contracts/schemas'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const comfyCache = new Map<string, ComfyMetadata | null>()

interface ComfyApiNode {
  inputs?: Record<string, unknown>
  class_type?: string
  _meta?: {
    title?: string
  }
}

type ComfyApiGraph = Record<string, ComfyApiNode>

function parseTextChunkData(type: string, data: Buffer): { key: string; value: string } | null {
  const nullIdx = data.indexOf(0)
  if (nullIdx <= 0) return null

  const key = data.subarray(0, nullIdx).toString('utf8').trim()

  if (type === 'tEXt') {
    const value = data.subarray(nullIdx + 1).toString('utf8')
    return { key, value }
  }

  if (type === 'zTXt') {
    // keyword \0 compression_method(1B) compressed_text
    if (nullIdx + 2 >= data.length) return null
    try {
      const inflated = zlib.inflateSync(data.subarray(nullIdx + 2))
      return { key, value: inflated.toString('utf8') }
    } catch {
      return null
    }
  }

  if (type === 'iTXt') {
    // keyword \0 compression_flag(1B) compression_method(1B) lang_tag \0 trans_key \0 text
    if (nullIdx + 3 > data.length) return null
    const compressionFlag = data[nullIdx + 1]
    let pos = nullIdx + 3
    const langNull = data.indexOf(0, pos)
    if (langNull === -1) return null
    pos = langNull + 1
    const transNull = data.indexOf(0, pos)
    if (transNull === -1) return null
    pos = transNull + 1

    const payload = data.subarray(pos)
    if (compressionFlag === 1) {
      try {
        const inflated = zlib.inflateSync(payload)
        return { key, value: inflated.toString('utf8') }
      } catch {
        return null
      }
    }
    return { key, value: payload.toString('utf8') }
  }

  return null
}

function resolveNodeText(graph: ComfyApiGraph, ref: unknown, visited = new Set<string>()): string {
  if (typeof ref === 'string') return ref.trim()
  if (!Array.isArray(ref) || ref.length < 1) return ''

  const nodeId = String(ref[0])
  const outIdx = Number(ref[1] ?? 0)
  const visitKey = `${nodeId}:${outIdx}`
  if (visited.has(visitKey)) return ''
  visited.add(visitKey)

  const node = graph[nodeId]
  if (!node || !node.inputs) return ''

  const title = String(node._meta?.title || '').toLowerCase()
  if (title.includes('system prompt')) return ''

  const ct = String(node.class_type || '')
  const inp = node.inputs

  if (ct === 'ConditioningZeroOut') return ''

  if (ct === 'ComfySwitchNode' || ct.toLowerCase().includes('switch')) {
    let sw = inp.switch ?? inp.select ?? inp.boolean
    if (Array.isArray(sw) && sw.length >= 1) {
      const swNode = graph[String(sw[0])]
      sw = swNode?.inputs?.value ?? swNode?.inputs?.boolean
    }
    const targetBranch = sw ? (inp.on_true ?? inp.true) : (inp.on_false ?? inp.false)
    return resolveNodeText(graph, targetBranch, visited)
  }

  if (ct === 'StringConcatenate' || ct.toLowerCase().includes('concat')) {
    const a = resolveNodeText(graph, inp.string_a ?? inp.text_a ?? inp.a, visited)
    const b = resolveNodeText(graph, inp.string_b ?? inp.text_b ?? inp.b, visited)
    const delim = typeof inp.delimiter === 'string' ? inp.delimiter : ', '
    if (a && b) return `${a}${delim}${b}`
    return a || b
  }

  if (outIdx === 1 && inp.negative_prompt !== undefined) {
    return resolveNodeText(graph, inp.negative_prompt, visited)
  }

  for (const key of ['text', 'prompt', 'value', 'string', 'text_g', 'text_l', 'source', 'positive', 'conditioning']) {
    if (inp[key] !== undefined) {
      const res = resolveNodeText(graph, inp[key], visited)
      if (res) return res
    }
  }

  return ''
}

function buildComfyMetadataFromChunks(chunks: Record<string, string>): ComfyMetadata | null {
  const workflowRaw = chunks['workflow']
  const promptRaw = chunks['prompt']

  if (!workflowRaw && !promptRaw) {
    return null
  }

  let promptGraph: ComfyApiGraph | null = null
  if (promptRaw) {
    try {
      const parsed = JSON.parse(promptRaw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        promptGraph = parsed as ComfyApiGraph
      }
    } catch {
      // Ignore malformed JSON
    }
  }

  let positivePrompt = ''
  let negativePrompt = ''
  let model: string | undefined
  let seed: string | number | undefined
  let steps: number | undefined
  let cfg: number | undefined
  let sampler: string | undefined
  let scheduler: string | undefined
  const lorasSet = new Set<string>()

  if (promptGraph) {
    const nodes = Object.values(promptGraph)

    // 1. Extract sampler params and follow positive/negative links
    for (const node of nodes) {
      if (!node || !node.inputs) continue
      const ct = String(node.class_type || '')
      const inp = node.inputs

      if (ct.includes('Sampler') || ct === 'KSampler' || ct === 'KSamplerAdvanced') {
        if (seed === undefined && (typeof inp.seed === 'number' || typeof inp.seed === 'string')) {
          seed = inp.seed
        } else if (seed === undefined && (typeof inp.noise_seed === 'number' || typeof inp.noise_seed === 'string')) {
          seed = inp.noise_seed
        }
        if (steps === undefined && typeof inp.steps === 'number') steps = inp.steps
        if (cfg === undefined && typeof inp.cfg === 'number') cfg = inp.cfg
        if (sampler === undefined && typeof inp.sampler_name === 'string') sampler = inp.sampler_name
        if (scheduler === undefined && typeof inp.scheduler === 'string') scheduler = inp.scheduler

        if (!positivePrompt && inp.positive !== undefined) {
          positivePrompt = resolveNodeText(promptGraph, inp.positive)
        }
        if (!negativePrompt && inp.negative !== undefined) {
          negativePrompt = resolveNodeText(promptGraph, inp.negative)
        }
      }

      // 2. Extract model / checkpoint / UNET name
      if (!model) {
        for (const modelKey of ['unet_name', 'ckpt_name', 'model_name', 'diffusion_model']) {
          if (typeof inp[modelKey] === 'string' && inp[modelKey]) {
            model = String(inp[modelKey])
            break
          }
        }
      }

      // 3. Extract LoRAs
      if (typeof inp.lora_name === 'string' && inp.lora_name) {
        lorasSet.add(inp.lora_name)
      }
    }

    // Fallback if positivePrompt was not connected directly to a standard KSampler
    if (!positivePrompt) {
      for (const node of nodes) {
        if (!node || !node.inputs) continue
        const ct = String(node.class_type || '')
        const title = String(node._meta?.title || '').toLowerCase()
        if (title.includes('negative') || title.includes('system prompt')) continue

        if (
          ct.includes('TextEncode') ||
          ct === 'CLIPTextEncode' ||
          (ct.includes('PrimitiveString') && title.includes('user prompt'))
        ) {
          const candidate =
            resolveNodeText(promptGraph, node.inputs.text) ||
            resolveNodeText(promptGraph, node.inputs.prompt) ||
            resolveNodeText(promptGraph, node.inputs.value)
          if (candidate && candidate.length > positivePrompt.length) {
            positivePrompt = candidate
          }
          if (!negativePrompt && typeof node.inputs.negative_prompt === 'string' && node.inputs.negative_prompt.trim()) {
            negativePrompt = node.inputs.negative_prompt.trim()
          }
        }
      }
    }
  }

  // Fallback to UI workflow nodes if prompt API graph wasn't embedded
  if (!positivePrompt && workflowRaw) {
    try {
      const wf = JSON.parse(workflowRaw)
      if (wf && Array.isArray(wf.nodes)) {
        for (const n of wf.nodes) {
          const type = String(n?.type || '')
          const title = String(n?.title || '').toLowerCase()
          if (title.includes('negative') || title.includes('system') || type === 'MarkdownNote' || type === 'Note') {
            continue
          }
          if (
            (type.includes('CLIPTextEncode') || type.includes('TextEncode') || type.includes('Prompt')) &&
            Array.isArray(n.widgets_values) &&
            typeof n.widgets_values[0] === 'string' &&
            n.widgets_values[0].trim().length > positivePrompt.length
          ) {
            positivePrompt = n.widgets_values[0].trim()
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    hasWorkflow: Boolean(workflowRaw || promptRaw),
    workflowJson: workflowRaw || promptRaw,
    promptApiJson: promptRaw,
    positivePrompt: positivePrompt || undefined,
    negativePrompt: negativePrompt || undefined,
    model,
    seed,
    steps,
    cfg,
    sampler,
    scheduler,
    loras: lorasSet.size > 0 ? Array.from(lorasSet) : undefined,
  }
}

/**
 * Extracts ComfyUI workflow & prompt metadata from an in-memory PNG Buffer.
 */
export function extractComfyMetadataFromPngBuffer(buf: Buffer): ComfyMetadata | null {
  if (buf.length < 16 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null
  }

  const textChunks: Record<string, string> = {}
  let offset = 8

  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    const dataStart = offset + 8
    const dataEnd = dataStart + length

    if (dataEnd > buf.length) break

    if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      const parsed = parseTextChunkData(type, buf.subarray(dataStart, dataEnd))
      if (parsed && (parsed.key === 'workflow' || parsed.key === 'prompt')) {
        textChunks[parsed.key] = parsed.value
      }
    }

    if (type === 'IEND') break
    offset = dataEnd + 4
  }

  return buildComfyMetadataFromChunks(textChunks)
}

/**
 * Fast disk-level ComfyUI PNG metadata extractor that skips over IDAT pixel data chunks
 * without loading the full image into RAM.
 */
export function extractComfyMetadataFromPngFile(filePath: string): ComfyMetadata | null {
  if (!filePath || !filePath.toLowerCase().endsWith('.png')) {
    return null
  }

  if (comfyCache.has(filePath)) {
    return comfyCache.get(filePath) ?? null
  }

  let fd: number | null = null
  try {
    if (!fs.existsSync(filePath)) return null
    const stat = fs.statSync(filePath)
    if (!stat.isFile() || stat.size < 16) return null

    fd = fs.openSync(filePath, 'r')
    const sigBuf = Buffer.allocUnsafe(8)
    if (fs.readSync(fd, sigBuf, 0, 8, 0) !== 8 || !sigBuf.equals(PNG_SIGNATURE)) {
      comfyCache.set(filePath, null)
      return null
    }

    const headerBuf = Buffer.allocUnsafe(8)
    const textChunks: Record<string, string> = {}
    let offset = 8

    while (offset + 8 <= stat.size) {
      const bytesRead = fs.readSync(fd, headerBuf, 0, 8, offset)
      if (bytesRead !== 8) break

      const length = headerBuf.readUInt32BE(0)
      const type = headerBuf.toString('ascii', 4, 8)
      const dataStart = offset + 8
      const dataEnd = dataStart + length

      if (dataEnd > stat.size) break

      if ((type === 'tEXt' || type === 'iTXt' || type === 'zTXt') && length > 0 && length < 15 * 1024 * 1024) {
        const chunkData = Buffer.allocUnsafe(length)
        if (fs.readSync(fd, chunkData, 0, length, dataStart) === length) {
          const parsed = parseTextChunkData(type, chunkData)
          if (parsed && (parsed.key === 'workflow' || parsed.key === 'prompt')) {
            textChunks[parsed.key] = parsed.value
          }
        }
      }

      if (type === 'IEND') break
      offset = dataEnd + 4
    }

    const result = buildComfyMetadataFromChunks(textChunks)
    if (comfyCache.size > 1000) {
      comfyCache.clear()
    }
    comfyCache.set(filePath, result)
    return result
  } catch {
    return null
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {
        // ignore
      }
    }
  }
}
