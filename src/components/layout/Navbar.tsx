import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useRateLimit } from '@/lib/github/rateLimit'

export interface NavbarProps {
  appName: string
  sourceLabel: string
  onToggleTheme?: () => void
  onShare?: () => void | Promise<void>
}

export function Navbar({
  appName,
  sourceLabel,
  onToggleTheme,
  onShare,
}: NavbarProps) {
  const handleToggleTheme = onToggleTheme ?? (() => undefined)
  const handleShare = onShare ?? (() => undefined)
  const { status } = useRateLimit()
  const resetTime =
    status.resetAt > 0
      ? new Date(status.resetAt * 1000).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })
      : ''
  const lowRateLimit = status.limit > 0 && status.remaining < 20
  const criticalRateLimit = status.limit > 0 && status.remaining < 5

  return (
    <header className="navbar-shell">
      {lowRateLimit ? (
        <div
          className={`rate-limit-banner ${criticalRateLimit ? 'is-critical' : 'is-warning'}`}
          role="status"
        >
          <span>
            Rate limit low: {status.remaining} requests remaining - resets at {resetTime}
          </span>
          {criticalRateLimit ? (
            <a href="#github-token" className="rate-limit-link">
              Add token
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="navbar">
        <h1 className="navbar-title">{appName}</h1>

        <div className="navbar-actions">
          <Badge label={sourceLabel} />
          <Button variant="ghost" onClick={handleShare}>
            Share
          </Button>
          <Button variant="ghost" onClick={handleToggleTheme}>
            Toggle Theme
          </Button>
        </div>
      </div>
    </header>
  )
}
