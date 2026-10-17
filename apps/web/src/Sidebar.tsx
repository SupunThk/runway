type Section =
  'overview' | 'create' | 'workspace' | 'borrowing' | 'assistant' | 'docs';

export function Sidebar({ active }: { active?: Section }) {
  const link = (
    section: Section,
    href: string,
    label: string,
    icon: string,
  ) => (
    <a
      href={href}
      className={active === section ? 'nav active' : 'nav'}
      aria-current={active === section ? 'page' : undefined}
    >
      <span aria-hidden="true">{icon}</span> <span>{label}</span>
    </a>
  );
  return (
    <aside className="sidebar">
      <a href="/" className="brand">
        <span className="brand-mark">r</span>runway
        <span className="brand-dot">.</span>
      </a>
      <div className="workspace-label">YOUR WORKSPACE</div>
      <nav aria-label="Main navigation">
        {link('overview', '/', 'Overview', '↗')}
        {link('create', '/?create=1', 'New schedule', '＋')}
        {link('workspace', '/workspace', 'Workspace', '▦')}
        {link('borrowing', '/borrowing', 'Borrowing', '₿')}
        {link('assistant', '/assistant', 'Assistant', '✦')}
      </nav>
      <div className="sidebar-footer">
        <nav aria-label="Help navigation">
          {link('docs', '/docs', 'Documentation', '?')}
        </nav>
        <div className="sidebar-bottom">
          <span className="network-dot" /> Mezo testnet
          <div>Built for teams that build.</div>
        </div>
      </div>
    </aside>
  );
}
