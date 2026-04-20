import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

export interface NavbarProps {
  appName: string
  sourceLabel: string
  onToggleTheme?: () => void
}

export function Navbar({ appName, sourceLabel, onToggleTheme }: NavbarProps) {
  const handleToggleTheme = onToggleTheme ?? (() => undefined)

  return (
    <header className="navbar">
      <h1 className="navbar-title">{appName}</h1>

      <div className="navbar-actions">
        <Badge label={sourceLabel} />
        <Button variant="ghost" onClick={handleToggleTheme}>
          Toggle Theme
        </Button>
      </div>
    </header>
  )
}
