# November 3 improvements

Execution is local only. Preserve existing uncommitted Wave 2 work and the deployed payment contract. No push, deployment, paid service, outreach or signed financial transaction is included.

| Work | Acceptance | Status |
| --- | --- | --- |
| Reliability and operations | Independent direct/proxy health diagnostics; bounded private request metrics; reconciliation age and documented actual-cost inputs | Implemented; public checks passed |
| Guided borrowing and funding | Owner/chain-scoped saved terms and receipts; reload recovery; no repeated borrowing or payment while evidence is unresolved | Implemented and verified |
| Protocol-aware planning | Shared quote engine; fee/mode/cap/minimum debt rules; cash and repayment reserves distinct from escrow | Implemented and verified |
| Transaction usability | Step progress, contextual blocked-action remedies and disclosure of advanced detail | Implemented; mobile screens reviewed |
| Client payment links | Private owner records; whitelisted public views; canonical transfer verification; shared atomic settlement ownership | Implemented; concurrency, privacy, expiry and recovery verified |
| Public funding proof | Wallet-free sender-only pinned reads; explicit partial/unavailable state and contract obligations coverage | Implemented and verified |
| Wallet validation and pilots | Offline financial regression coverage; fork harness if supported; manual installed-wallet runbook and independent pilot materials | Fork passed; runbook ready; installed-wallet/pilot sessions remain manual |
| Final verification | Type checks, unit/API, browser, contracts, build, formatting and visual review with dated evidence | Passed; evidence below |

The user-designated public admin wallet is configured in ignored `.runway-local.json`; `node scripts/dev-local.mjs` was restarted with it. Open `http://127.0.0.1:5300/admin`, connect that installed wallet and sign the login message. Temporary records disappear on shutdown. Fixture wallets are not assigned to the user's admin allowlist.

The user chose to skip further hosted inspection. Public checks already completed: direct/proxied health returned 200/database connected, unsigned sessions 401, initial responses about 64 seconds and warm responses 163–206 ms. Timing is consistent with a cold start; no outage cause is inferred from timeout alone. No hosted setting changed.

Final evidence: [improvements-local.check.json](../deployments/improvements-local.check.json). Passed **152 unit/API/frontend tests in 20 files, all 116 browser cases, 24 offline contract tests and one separate isolated protocol fork**, plus TypeScript, isolated production build, formatting and whitespace. The optional fork case is skipped offline and was executed successfully by `pnpm test:fork` at block 16550812. It uses synthetic BTC and replays the authentic native oracle response from that block; it is separate from installed-wallet and live native-precompile evidence.

The [pilot runbook](pilot-runbook.md) supplies tasks, failure cases, consent guidance, a results template and outreach draft. No outreach or real financial transaction was performed. Actual operating-cost totals require a dated actual record; no bill or fee revenue is invented.

### Future release considerations

No release is authorized here. A later release must coordinate Render's separate backend branch before Vercel's frontend. Database initialization backfills historical invoice settlement keys and stops on conflicts; review conflicts instead of overwriting them. Configure hosted admin access separately. Borrowing writes retain their production opt-in flag. The existing payment contract and manifest are unchanged. Verify `/pay/*` and `/proof/*` direct loads/reloads and API proxy readiness after a separately authorized release.

Billing and actual fee collection, milestone contracts and atomic borrowing/routing remain outside these improvements. Operating costs are unavailable unless a dated actual-cost record is supplied. Payment activity is not revenue.
