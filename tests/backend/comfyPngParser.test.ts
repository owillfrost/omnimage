import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import {
  extractComfyMetadataFromPngBuffer,
  extractComfyMetadataFromPngFile,
} from '../../server/metadata/comfyPngParser'

function makePngChunk(type: string, data: Buffer): Buffer {
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4, 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

function makeTextChunk(keyword: string, text: string): Buffer {
  const payload = Buffer.concat([
    Buffer.from(keyword, 'utf8'),
    Buffer.from([0]),
    Buffer.from(text, 'utf8'),
  ])
  return makePngChunk('tEXt', payload)
}

function buildSyntheticComfyPng(promptObj: Record<string, unknown>, workflowObj?: Record<string, unknown>): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = makePngChunk('IHDR', Buffer.alloc(13, 1))
  const promptChunk = makeTextChunk('prompt', JSON.stringify(promptObj))
  const chunks = [signature, ihdr, promptChunk]
  if (workflowObj) {
    chunks.push(makeTextChunk('workflow', JSON.stringify(workflowObj)))
  }
  chunks.push(makePngChunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(chunks)
}

describe('ComfyUI PNG Metadata Parser', () => {
  it('extracts workflow JSON, positive/negative prompts, and sampler params from PNG tEXt chunks', () => {
    const promptGraph = {
      '3': {
        inputs: {
          seed: 987654321,
          steps: 20,
          cfg: 3.5,
          sampler_name: 'euler',
          scheduler: 'simple',
          model: ['16', 0],
          positive: ['6', 0],
          negative: ['7', 0],
        },
        class_type: 'KSampler',
      },
      '6': {
        inputs: {
          text: 'Cinematic cyberpunk alley in heavy rain, neon reflections',
        },
        class_type: 'CLIPTextEncode',
      },
      '7': {
        inputs: {
          text: 'blurry, low quality, watermark',
        },
        class_type: 'CLIPTextEncode',
      },
      '16': {
        inputs: {
          unet_name: 'flux1-dev-fp8.safetensors',
        },
        class_type: 'UNETLoader',
      },
    }

    const workflowGraph = {
      id: 'test-workflow-uuid',
      last_node_id: 16,
      nodes: [{ id: 6, type: 'CLIPTextEncode' }],
    }

    const pngBuf = buildSyntheticComfyPng(promptGraph, workflowGraph)
    const meta = extractComfyMetadataFromPngBuffer(pngBuf)

    expect(meta).not.toBeNull()
    expect(meta?.hasWorkflow).toBe(true)
    expect(meta?.positivePrompt).toBe('Cinematic cyberpunk alley in heavy rain, neon reflections')
    expect(meta?.negativePrompt).toBe('blurry, low quality, watermark')
    expect(meta?.model).toBe('flux1-dev-fp8.safetensors')
    expect(meta?.seed).toBe(987654321)
    expect(meta?.steps).toBe(20)
    expect(meta?.cfg).toBe(3.5)
    expect(meta?.sampler).toBe('euler')
    expect(meta?.scheduler).toBe('simple')
    expect(JSON.parse(meta?.workflowJson || '{}').id).toBe('test-workflow-uuid')
  })

  it('resolves subgraph switches, string concatenation, and ignores System Prompt nodes', () => {
    const promptGraph = {
      '30:3': {
        inputs: {
          seed: 123456,
          steps: 8,
          cfg: 1.0,
          sampler_name: 'euler',
          scheduler: 'simple',
          positive: ['30:6', 0],
          negative: ['30:13', 0],
        },
        class_type: 'KSampler',
      },
      '30:6': {
        inputs: {
          text: ['30:27', 0],
        },
        class_type: 'CLIPTextEncode',
      },
      '30:13': {
        inputs: {
          conditioning: ['30:6', 0],
        },
        class_type: 'ConditioningZeroOut',
      },
      '30:18': {
        inputs: {
          value: 'You are an expert prompt engineer...',
        },
        class_type: 'PrimitiveStringMultiline',
        _meta: { title: 'Text String (System Prompt)' },
      },
      '30:19': {
        inputs: {
          value: 'Portrait of a woman in greenu art style',
        },
        class_type: 'PrimitiveStringMultiline',
        _meta: { title: 'Text String (User Prompt)' },
      },
      '30:17': {
        inputs: {
          string_a: ['30:18', 0],
          string_b: ['30:19', 0],
          delimiter: '',
        },
        class_type: 'StringConcatenate',
      },
      '30:27': {
        inputs: {
          string_a: ['30:17', 0],
          string_b: 'greenu art style',
          delimiter: ', ',
        },
        class_type: 'StringConcatenate',
      },
    }

    const pngBuf = buildSyntheticComfyPng(promptGraph)
    const meta = extractComfyMetadataFromPngBuffer(pngBuf)

    expect(meta).not.toBeNull()
    expect(meta?.positivePrompt).toBe('Portrait of a woman in greenu art style, greenu art style')
    expect(meta?.negativePrompt).toBeUndefined()
  })

  it('reads real ComfyUI PNG file from disk if COMFY_SAMPLE_PNG env is set', () => {
    const sampleFile = process.env.COMFY_SAMPLE_PNG
    if (!sampleFile || !fs.existsSync(sampleFile)) return

    const meta = extractComfyMetadataFromPngFile(sampleFile)
    expect(meta).not.toBeNull()
    expect(meta?.hasWorkflow).toBe(true)
    expect(meta?.workflowJson?.length).toBeGreaterThan(100)
    expect(meta?.positivePrompt?.length).toBeGreaterThan(20)
  })
})
