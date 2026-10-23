import { Icon } from './Icon';

type Section =
  'overview' | 'create' | 'workspace' | 'borrowing' | 'assistant' | 'docs';

export function Sidebar({ active }: { active?: Section }) {
  const link = (
    section: Section,
    href: string,
    label: string,
    icon: Parameters<typeof Icon>[0]['name'],
  ) => (
    <a
      href={href}
      className={active === section ? 'nav active' : 'nav'}
      aria-current={active === section ? 'page' : undefined}
    >
      <Icon name={icon} /> <span>{label}</span>
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
        {link('overview', '/', 'Overview', 'overview')}
        {link('create', '/?create=1', 'New payment', 'plus')}
        {link('workspace', '/workspace', 'Workspace', 'workspace')}
        {link('borrowing', '/borrowing', 'Borrowing', 'borrowing')}
        {link('assistant', '/assistant', 'Assistant', 'assistant')}
      </nav>
      <div className="sidebar-footer">
        <nav aria-label="Help navigation">
          {link('docs', '/docs', 'Documentation', 'docs')}
        </nav>
        <div className="sidebar-bottom">
          <span className="network-dot" /> Mezo testnet
          <div>Built for teams that build.</div>
        </div>
      </div>
    </aside>
  );
}
