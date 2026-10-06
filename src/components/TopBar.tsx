import type { ReactNode } from 'react'

export function TopBar({ title, onBack, right }: { title: ReactNode; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="topbar">
      {onBack ? (
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
          ‹
        </button>
      ) : (
        <span className="icon-btn-spacer" />
      )}
      <h1 className="topbar-title">{title}</h1>
      {right ?? <span className="icon-btn-spacer" />}
    </header>
  )
}
