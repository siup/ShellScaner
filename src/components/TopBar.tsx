import type { ReactNode } from 'react'
import { Icon } from './Icon'

/** iOS-style navigation bar: blurred, sticky, back button on the left. */
export function TopBar({
  title,
  onBack,
  backLabel = 'Back',
  right,
}: {
  title: ReactNode
  onBack?: () => void
  backLabel?: string
  right?: ReactNode
}) {
  return (
    <header className="topbar">
      <div className="topbar-side">
        {onBack && (
          <button type="button" className="nav-back" onClick={onBack}>
            <Icon name="back" size={24} />
            <span>{backLabel}</span>
          </button>
        )}
      </div>
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-side right">{right}</div>
    </header>
  )
}
