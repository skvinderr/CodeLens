export interface ProgressOverlayProps {
  isVisible: boolean
  message?: string
  progress?: number
}

export function ProgressOverlay({
  isVisible,
  message = 'Working...',
  progress = 0,
}: ProgressOverlayProps) {
  if (!isVisible) {
    return null
  }

  const boundedProgress = Math.max(0, Math.min(100, progress))

  return (
    <div className="progress-overlay" role="status" aria-live="polite">
      <div className="progress-panel">
        <div>{message}</div>
        <div className="progress-track" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${boundedProgress}%` }} />
        </div>
      </div>
    </div>
  )
}
