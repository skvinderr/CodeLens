export type Severity = 'low' | 'medium' | 'high' | 'critical'

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

export function withAlpha(hex: string, alpha: number): string {
  const normalized = Math.max(0, Math.min(1, alpha))
  const alphaHex = Math.round(normalized * 255)
    .toString(16)
    .padStart(2, '0')
  return `${hex}${alphaHex}`
}
