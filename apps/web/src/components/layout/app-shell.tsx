import type { ReactNode } from 'react';

export function AppShell({
  brand,
  actions,
  sidebar,
  toolsTrigger,
  overlays,
  children,
}: {
  brand: ReactNode;
  actions: ReactNode;
  sidebar: ReactNode;
  toolsTrigger?: ReactNode;
  overlays?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">{brand}</div>
        <div className="topbar-actions">{actions}</div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          {sidebar}
          {toolsTrigger}
        </aside>
        <main className="content">{children}</main>
      </div>
      {overlays}
    </div>
  );
}
