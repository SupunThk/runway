import { Sidebar } from './Sidebar';

export function RouteFallback() {
  return (
    <div className="shell">
      <Sidebar />
      <main>
        <header className="topbar">
          <span>RUNWAY WORKSPACE</span>
        </header>
        <div className="content" role="status">
          <span className="route-loading-label">Loading page…</span>
          <span className="skeleton-line" aria-hidden="true" />
          <span className="skeleton-line short" aria-hidden="true" />
          <span className="skeleton-line" aria-hidden="true" />
        </div>
      </main>
    </div>
  );
}
