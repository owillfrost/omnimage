export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c
  } else {
    r = c; g = 0; b = x
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ]
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`
}

export function hsvToHex(h: number, s: number, v: number): string {
  const [r, g, b] = hsvToRgb(h, s, v)
  return rgbToHex(r, g, b)
}

export function hexToRgbStrict(hex: string): [number, number, number] | null {
  const clean = hex.replace(/^#/, '').trim()
  if (/^[0-9A-Fa-f]{3}$/.test(clean)) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ]
  }
  if (/^[0-9A-Fa-f]{6}$/.test(clean)) {
    const num = parseInt(clean, 16)
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
  }
  return null
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rNorm = r / 255
  const gNorm = g / 255
  const bNorm = b / 255
  const max = Math.max(rNorm, gNorm, bNorm)
  const min = Math.min(rNorm, gNorm, bNorm)
  const d = max - min

  let h = 0
  const s = max === 0 ? 0 : d / max
  const v = max

  if (max !== min) {
    switch (max) {
      case rNorm:
        h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) * 60
        break
      case gNorm:
        h = ((bNorm - rNorm) / d + 2) * 60
        break
      case bNorm:
        h = ((rNorm - gNorm) / d + 4) * 60
        break
    }
  }

  return [Math.round(h), s, v]
}

/**
 * Converts sRGB to CIELAB space (D65 standard illuminant).
 * Used for perceptual color difference calculations matching human vision.
 */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  // sRGB to linear RGB
  let R = r / 255
  let G = g / 255
  let B = b / 255

  R = R > 0.04045 ? Math.pow((R + 0.055) / 1.055, 2.4) : R / 12.92
  G = G > 0.04045 ? Math.pow((G + 0.055) / 1.055, 2.4) : G / 12.92
  B = B > 0.04045 ? Math.pow((B + 0.055) / 1.055, 2.4) : B / 12.92

  // Linear RGB to CIE XYZ
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.00000
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const fx = f(X)
  const fy = f(Y)
  const fz = f(Z)

  const L = 116 * fy - 16
  const a = 500 * (fx - fy)
  const bVal = 200 * (fy - fz)

  return [L, a, bVal]
}

export function normalizeHex(input: string): string | null {
  const rgb = hexToRgbStrict(input)
  if (!rgb) return null
  return rgbToHex(rgb[0], rgb[1], rgb[2])
}

/**
 * Offsets hue slightly when adding a new color slot so it doesn't collide as a duplicate.
 */
export function getNextDistinctColor(
  existingColors: string[],
  baseHsv: [number, number, number]
): [number, number, number] {
  for (let step = 1; step <= 12; step++) {
    const nextH = (baseHsv[0] + step * 35) % 360
    const nextS = clamp(baseHsv[1], 0.45, 0.9)
    const nextV = clamp(baseHsv[2], 0.55, 0.95)
    const candidateHex = hsvToHex(nextH, nextS, nextV)
    if (!existingColors.some((c) => c.toUpperCase() === candidateHex.toUpperCase())) {
      return [nextH, nextS, nextV]
    }
  }
  return [(baseHsv[0] + 45) % 360, 0.7, 0.9]
}

export interface CalibratedAccent {
  accent: string
  bright: string
  subtle: string
}

/**
 * Calibrates an artwork dominant color to ensure healthy contrast against the deep dark canvas (#09090b)
 * while deriving bright and subtle tones for GPU-accelerated ripple shimmer effects.
 */
export function calibrateAnchorAccent(inputHex?: string | null): CalibratedAccent {
  if (!inputHex) {
    return {
      accent: '#a1a1aa',
      bright: '#f4f4f5',
      subtle: 'rgba(161, 161, 170, 0.14)',
    }
  }

  const rgb = hexToRgbStrict(inputHex)
  if (!rgb) {
    return {
      accent: '#a1a1aa',
      bright: '#f4f4f5',
      subtle: 'rgba(161, 161, 170, 0.14)',
    }
  }

  const [h, s, v] = rgbToHsv(rgb[0], rgb[1], rgb[2])

  // Prevent accents from vanishing in #09090b: ensure minimum brightness
  const calibratedV = clamp(v, 0.52, 0.96)
  // Ensure non-zero saturation for chromatic life while avoiding oversaturation on neon
  const calibratedS = s < 0.08 ? 0.12 : clamp(s, 0.35, 0.88)

  const accentHex = hsvToHex(h, calibratedS, calibratedV)
  const brightHex = hsvToHex(h, clamp(calibratedS * 0.7, 0.1, 0.65), clamp(calibratedV * 1.15, 0.8, 1.0))
  
  const [brR, brG, brB] = hexToRgbStrict(accentHex) || [200, 200, 200]
  const subtleRgba = `rgba(${brR}, ${brG}, ${brB}, 0.14)`

  return {
    accent: accentHex,
    bright: brightHex,
    subtle: subtleRgba,
  }
}
