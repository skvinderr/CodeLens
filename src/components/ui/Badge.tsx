export interface BadgeProps {
  label: string
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
}

const toneClassMap: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'badge-neutral',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
}

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  return <span className={`badge ${toneClassMap[tone]}`}>{label}</span>
}
