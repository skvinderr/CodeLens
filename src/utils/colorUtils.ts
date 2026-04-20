export type Severity = 'low' | 'medium' | 'high' | 'critical'

const LANGUAGE_COLOR_MAP: Record<string, string> = {
  js: '#3b82f6',
  jsx: '#3b82f6',
  javascript: '#3b82f6',
  ts: '#1e3a8a',
  tsx: '#1e3a8a',
  typescript: '#1e3a8a',
  css: '#ec4899',
  scss: '#ec4899',
  sass: '#ec4899',
  py: '#22c55e',
  python: '#22c55e',
  json: '#f59e0b',
  md: '#14b8a6',
  markdown: '#14b8a6',
}

const FALLBACK_LANGUAGE_COLOR = '#94a3b8'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalizeHex(hex: string): string {
  const trimmed = hex.trim().replace('#', '')
  if (trimmed.length === 3) {
    return `#${trimmed
      .split('')
      .map((char) => `${char}${char}`)
      .join('')}`
  }

  return `#${trimmed.padEnd(6, '0').slice(0, 6)}`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHex(hex).replace('#', '')

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const rHex = clamp(Math.round(r), 0, 255).toString(16).padStart(2, '0')
  const gHex = clamp(Math.round(g), 0, 255).toString(16).padStart(2, '0')
  const bHex = clamp(Math.round(b), 0, 255).toString(16).padStart(2, '0')

  return `#${rHex}${gHex}${bHex}`
}

function rgbToHsl(
  rInput: number,
  gInput: number,
  bInput: number,
): { h: number; s: number; l: number } {
  const r = rInput / 255
  const g = gInput / 255
  const b = bInput / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1))

    switch (max) {
      case r:
        h = ((g - b) / delta) % 6
        break
      case g:
        h = (b - r) / delta + 2
        break
      default:
        h = (r - g) / delta + 4
        break
    }

    h *= 60
    if (h < 0) {
      h += 360
    }
  }

  return { h, s, l }
}

function hslToRgb(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - chroma / 2

  let rPrime = 0
  let gPrime = 0
  let bPrime = 0

  if (h < 60) {
    rPrime = chroma
    gPrime = x
  } else if (h < 120) {
    rPrime = x
    gPrime = chroma
  } else if (h < 180) {
    gPrime = chroma
    bPrime = x
  } else if (h < 240) {
    gPrime = x
    bPrime = chroma
  } else if (h < 300) {
    rPrime = x
    bPrime = chroma
  } else {
    rPrime = chroma
    bPrime = x
  }

  return {
    r: (rPrime + m) * 255,
    g: (gPrime + m) * 255,
    b: (bPrime + m) * 255,
  }
}

export function severityToColor(severity: Severity): string {
  switch (severity) {
    case 'low':
      return '#1dc77e'
    case 'medium':
      return '#f0aa33'
    case 'high':
      return '#ff8a4c'
    case 'critical':
      return '#ff6a6a'
    default:
      return '#9eb2c6'
  }
}

export function languageToColor(language?: string): string {
  if (!language) {
    return FALLBACK_LANGUAGE_COLOR
  }

  const key = language.trim().toLowerCase().replace(/^\./, '')
  return LANGUAGE_COLOR_MAP[key] ?? FALLBACK_LANGUAGE_COLOR
}

export function darkenHex(hex: string, amount = 0.2): string {
  const { r, g, b } = hexToRgb(hex)
  const { h, s, l } = rgbToHsl(r, g, b)
  const darkerLightness = clamp(l * (1 - amount), 0, 1)
  const darker = hslToRgb(h, s, darkerLightness)

  return rgbToHex(darker.r, darker.g, darker.b)
}

export function withSaturation(hex: string, saturation: number): string {
  const { r, g, b } = hexToRgb(hex)
  const { h, l } = rgbToHsl(r, g, b)
  const adjusted = hslToRgb(h, clamp(saturation, 0, 1), l)

  return rgbToHex(adjusted.r, adjusted.g, adjusted.b)
}

export function withAlpha(hex: string, alpha: number): string {
  const normalized = Math.max(0, Math.min(1, alpha))
  const alphaHex = Math.round(normalized * 255)
    .toString(16)
    .padStart(2, '0')
  return `${hex}${alphaHex}`
}
