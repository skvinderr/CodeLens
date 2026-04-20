import type { AppStatus } from '@/types'

export interface StatusBarProps {
  message: string
  kind: AppStatus['kind']
}

const statusClassMap: Record<StatusBarProps['kind'], string> = {
  idle: 'status-idle',
  loading: 'status-loading',
  ready: 'status-ready',
  error: 'status-error',
}

export function StatusBar({ message, kind }: StatusBarProps) {
  return <footer className={`status-bar ${statusClassMap[kind]}`}>{message}</footer>
}
