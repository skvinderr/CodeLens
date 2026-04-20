import type { PropsWithChildren } from 'react'

export interface SidebarProps extends PropsWithChildren {
  title: string
}

export function Sidebar({ title, children }: SidebarProps) {
  return (
    <aside className="sidebar">
      <h2 className="sidebar-title">{title}</h2>
      {children}
    </aside>
  )
}
