import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { WalletConnection } from './WalletConnection';
import { BorrowingPosition } from './BorrowingPosition';
import { RunwayPlanner } from './RunwayPlanner';

export function Borrowing() {
  const [notice, setNotice] = useState('');
  return (
    <div className="shell">
      <Sidebar active="borrowing" />
      <main>
        <header className="topbar">
          <span>BTC COLLATERAL &amp; MUSD DEBT</span>
          <div className="wallet-tools">
            <span className="badge">TESTNET ONLY</span>
            <WalletConnection onNotice={setNotice} />
          </div>
        </header>
        <div className="content">
          <section className="page-heading">
            <div>
              <h1>Mezo borrowing</h1>
              <p>Track BTC collateral, MUSD debt and price-drop scenarios.</p>
            </div>
          </section>
          {notice && (
            <p className="callout" role="status">
              {notice}
            </p>
          )}
          <div className="borrowing-layout">
            <BorrowingPosition />
            <RunwayPlanner />
            <section
              className="info-card borrowing-explainer"
              aria-label="How Mezo borrowing works"
            >
              <span className="eyebrow">FROM BTC TO WORKING CAPITAL</span>
              <h2>Borrow against your BTC.</h2>
              <p>
                Mezo lets you lock BTC as collateral and borrow MUSD against it.
                The MUSD is a loan that accrues interest.
              </p>
              <p>
                You can use MUSD to fund Runway payment schedules. Paying your
                team does not repay your Mezo loan; repayment is a separate
                action.
              </p>
              <p>
                If BTC falls in value, your collateral ratio falls too. A
                position can be liquidated when it no longer meets the protocol
                requirements.
              </p>
              <p>
                This page reads your testnet position and explores hypothetical
                price changes. Open Mezo to borrow, add collateral or repay.
              </p>
              <a
                href="https://mezo.org/docs/users/resources/faqs"
                target="_blank"
                rel="noreferrer"
              >
                Learn about Mezo borrowing ↗
              </a>
            </section>
          </div>
          <footer>
            <span>Runway · Built on Mezo</span>
            <span>Testnet prototype. Use test assets only.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
