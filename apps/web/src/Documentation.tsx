import { guideMarkdown, guideSections } from './guide';

function downloadGuide() {
  const url = URL.createObjectURL(
    new Blob([guideMarkdown], { type: 'text/markdown;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'runway-user-guide.md';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Documentation() {
  return (
    <div className="shell docs-shell">
      <a className="skip-link" href="#guide">
        Skip to guide
      </a>
      <aside className="sidebar">
        <a href="/" className="brand">
          <span className="brand-mark">r</span>runway
          <span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          <a href="/" className="nav">
            Overview
          </a>
          <a href="/?create=1" className="nav">
            New schedule
          </a>
          <a href="/docs" className="nav active" aria-current="page">
            Documentation
          </a>
          <a href="/workspace" className="nav">
            Workspace
          </a>
        </nav>
        <div className="sidebar-bottom">
          <span className="network-dot" /> Mezo testnet
          <div>Built for teams that build.</div>
        </div>
      </aside>
      <main id="guide" tabIndex={-1}>
        <header className="topbar">
          <span>THE RUNWAY GUIDE</span>
          <div className="wallet-tools">
            <span className="badge">TESTNET ONLY</span>
            <a href="/" className="button secondary">
              Open app
            </a>
          </div>
        </header>
        <div className="content docs-content">
          <div className="eyebrow">FROM FUNDING TO FINAL PAYMENT</div>
          <div className="page-heading">
            <div>
              <h1>Understand your Runway.</h1>
              <p>A practical guide for founders and contractors.</p>
            </div>
            <button className="button secondary" onClick={downloadGuide}>
              Download guide
            </button>
          </div>
          <div className="docs-intro">
            <p>
              Reserve the full payment upfront. Let it accrue over time. Claim
              what has been earned.
            </p>
            <p>
              Read without connecting a wallet. Start with the founder or
              contractor steps, or explore the details below.
            </p>
            <div className="actions">
              <a className="button" href="#fund-a-schedule">
                I’m funding a payment
              </a>
              <a className="button secondary" href="#claim-a-payment">
                I’m receiving a payment
              </a>
            </div>
          </div>
          <div className="docs-layout">
            <nav className="docs-toc" aria-label="On this page">
              <h2>On this page</h2>
              {guideSections.map((section) => (
                <a key={section.id} href={`#${section.id}`}>
                  {section.title}
                </a>
              ))}
            </nav>
            <article className="docs-article" aria-label="Runway user guide">
              {guideSections.map((section, index) => (
                <section
                  key={section.id}
                  id={section.id}
                  className="docs-section"
                >
                  <div className="eyebrow">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <h2>{section.title}</h2>
                  {section.steps ? (
                    <ol>
                      {section.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  ) : null}
                  {section.paragraphs?.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {section.bullets ? (
                    <ul>
                      {section.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))}
              <section className="docs-section" id="references">
                <h2>Explore the project</h2>
                <p>
                  <a href="https://explorer.test.mezo.org/address/0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D?tab=contract">
                    Verified payment contract
                  </a>
                </p>
                <p>
                  <a href="https://github.com/SupunThk/runway">
                    Source code and developer documentation
                  </a>
                </p>
                <a className="button" href="/">
                  Back to Runway
                </a>
              </section>
            </article>
          </div>
        </div>
      </main>
    </div>
  );
}
