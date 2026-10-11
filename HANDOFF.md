# Runway project handoff

Updated October 11, 2026. Read this first when continuing in a new session. This records completed work and verified results; balances and deployment checks are historical snapshots.

## 1. What this project is

Runway is a testnet payment protocol and web app on Mezo. A sender deposits the full MUSD payment upfront, the recipient earns it linearly over a chosen duration, and claims transfer earned funds to the fixed recipient.

There is no traditional backend server or database. The React frontend reads blockchain state through RPC; the Solidity contract holds the money and enforces payment rules. Vercel hosts the frontend. Wallets sign transactions.

Mezo borrowing is separate. Runway does not currently borrow, lend, repay loans, earn yield, or automatically submit claims. Paying a contractor does not repay a Mezo borrowing position. Read-only founder/contractor position checks were verified October 11 (see section 8); saved values are historical snapshots.

The user is learning these concepts. Explain steps plainly and use the existing testnet accounts and contract. [explanation.md](explanation.md) is the beginner's guide.

## 2. Where everything is

| Item | Value |
| --- | --- |
| Local workspace | `C:\Projects\MEZO` |
| Shell | Windows PowerShell |
| GitHub repository | https://github.com/SupunThk/runway |
| SSH remote | `git@github.com:SupunThk/runway.git` |
| Branch | `main`, tracking `origin/main` |
| Public frontend | https://mezo-runway-testnet.vercel.app |
| Local frontend | `http://127.0.0.1:5173` when the dev server is running |
| Vercel team | `supunthks-projects` |
| Vercel project | `mezo-runway-testnet` |
| Vercel project ID | `prj_xVu0NEGFRc47pJFYnZI87erHvqoX` |
| Vercel team ID | `team_0003YMxdv6pi0w9vMdCToeSG` |

Before this handoff was created, the latest commit was `a27e0e6` (GitHub-linked Vercel deployment documentation). The initial implementation commit was `8a58ef1`. Run `git status` and `git log` at the start of the next session; this handoff may not yet have been committed or pushed.

## 3. Network, assets, and accounts

| Setting | Verified value |
| --- | --- |
| Network | Mezo Testnet |
| Chain ID | `31611` |
| RPC | `https://rpc.test.mezo.org` |
| Explorer | `https://explorer.test.mezo.org` |
| Native gas currency | BTC, 18 decimals |
| MUSD token | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`, 18 decimals |
| MEZO token | `0x7B7c000000000000000000000000000000000001`, 18 decimals; unused in the payment flow |
| Payment contract | `0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D` |
| Founder / sender | `0x1ac891Ce491851AC87851D62B9184c75A76f55cF` |
| Contractor / recipient | `0x99d7a7dcf20a0ac9fc3D03Cd90b0a1F4BC561b09` |

The user controls both test accounts and tested with Brave Wallet. Rabby and MetaMask selection are also supported. Automated wallet tests use simulated providers; they do not prove every installed extension's signing behavior.

The contract was deployed by the founder in transaction:

`0xdb151ec249a704f17390ba6b35ef5458924deff142a796995c60773c3a80f45f`

Deployment block: `16083735`. Successful receipt, founder, exact local creation bytecode, constructor MUSD argument, deployed code and immutable token getter were verified. Explorer source verification and an independent audit have not been performed. Reuse this contract for the current app; another deployment is unnecessary for ordinary frontend work.

## 4. Completed implementation

- React/Vite/TypeScript workspace with wagmi, viem and TanStack Query.
- Wallet picker with EIP-6963 discovery, explicit Rabby/MetaMask selection, generic injected-wallet fallback, disconnect and connection-error recovery.
- Mezo testnet configuration checks, token metadata checks and payment-contract/MUSD validation before enabling writes.
- Actual wallet MUSD and BTC balances, funded obligations, and schedule reads.
- Exact MUSD allowance approval followed by a separate fully funded creation transaction.
- Start time based on blockchain time, approximately two minutes after approval; configurable duration in whole minutes.
- Recipient routes at `/schedules/<id>`, including public access without connecting a wallet.
- Linear accrual, claims, sender cancellation and preserved unpaid earned entitlement.
- `COMPLETED` status for fully paid uncancelled schedules; `CANCELLED` remains visible after cancellation settlement.
- Cancellation details: recipient's total earned amount and sender's refund.
- Cancellation hidden after the end time; explanatory messages for settled or still-unpaid schedules.
- Schedule and claimable reads pinned to the same block for consistent accounting.
- Fixed navigation from a recipient page into creating another schedule. Previously creating from `/schedules/1` returned users to the old schedule.
- Solidity tests, accounting tests, browser tests, deployment verification scripts and public-site verification.
- Git repository created and pushed to GitHub; existing Vercel project connected to it.

Contract rules: recipient cannot be changed; anyone may trigger a claim, but it always pays the stored recipient; only the sender may cancel, and only before the end; cancellation refunds unearned money and preserves earned money. The contract is non-upgradeable and has no admin withdrawal or application fee.

## 5. Real two-wallet tests completed

The user signed the transactions. The agent verified the results through read-only RPC inspection.

| Result | Schedule 1 | Schedule 2 |
| --- | --- | --- |
| Total funded | 1 MUSD | 1 MUSD |
| Duration | 5 minutes | 10 minutes |
| Final status | Completed | Cancelled and settled |
| Recipient earned and claimed | 1 MUSD | 0.628333333333333333 MUSD |
| Sender cancellation refund | None | 0.371666666666666667 MUSD |
| Remaining claimable | 0 MUSD | 0 MUSD |

At blocks `16084331` and `16084332`, the contractor held `1.628333333333333333 MUSD` and the payment contract held zero MUSD. These are recorded balances, not a live balance guarantee.

Schedule 2's cancellation transaction is `0xc925c772c8205fcfd90721cd52a731945ccdbd5d07086a52592c5195571eb90c`. Its final claim transaction is `0x450fb17cfe85d50da8c81cbc520641e50f908f4102fd3032bc6dd10b7edb5ce6`.

Full event histories and transaction hashes are in:

- [deployments/schedule-1.check.json](deployments/schedule-1.check.json)
- [deployments/schedule-2.check.json](deployments/schedule-2.check.json)

Both tests are finished. Do not ask the user to repeat them just to establish project context. Existing on-chain history is suitable for developing the next feature.

## 6. Hosting and automatic deployment

The app was first published as a local static build. It was then changed to GitHub-driven source builds using the **same Vercel project and public URL**.

Confirmed GitHub deployment:

- ID: `dpl_VhctE7eZaxParBep8o9qKU3NcbKc`
- Source: GitHub, `SupunThk/runway`, branch `main`
- Commit: `a27e0e6cac7666aa9eef9eb795f5044de7794db4`
- Result: production READY, aliased to https://mezo-runway-testnet.vercel.app
- Build: cloned the repository, installed the locked dependencies, passed TypeScript and built Vite successfully.

Pushes to `main` trigger production builds. Other branches can receive preview deployments. GitHub Actions also runs checks, but those checks are **not currently a gate** on Vercel production deployment.

Project build settings:

| Setting | Value |
| --- | --- |
| Root | Repository root |
| Framework | Other |
| Node | `24.x` |
| Install | `corepack pnpm install --frozen-lockfile` |
| Build | `corepack pnpm build` |
| Output | `apps/web/dist` |

Vercel has the five public `VITE_` values from `.env.example`, plus `ENABLE_EXPERIMENTAL_COREPACK=1`, configured for production, preview and development. The root ignored `.env` is not uploaded through GitHub. No wallet private key is needed for frontend hosting.

The Vercel connector initially had restricted/stale access (403 on project creation and later 404 on the new project). The authenticated **Vercel CLI fallback succeeded**. Use explicit team/project scope for future operations. The static fallback directory `.publish/mezo-runway-testnet` has a local Vercel project link; do not assume an arbitrary directory is linked to the correct project.

Important evidence distinction: `deployments/mezo-testnet.frontend.json` describes the **initial static deployment**, not the later GitHub deployment above. It is not evidence that GitHub integration is missing. See [docs/frontend-hosting.md](docs/frontend-hosting.md) for the current workflow.

## 7. Verification already performed

- 9 Solidity tests passed, including 256 fuzz cases.
- 4 integer/accounting tests passed.
- 12 browser tests passed: existing wallet/navigation/mobile checks plus completed, cancelled-unpaid and cancelled-settled display cases.
- Production build and TypeScript checks passed locally and in the GitHub-triggered Vercel build.
- Real deployment, full payment, cancellation refund and post-cancellation final claim verified on testnet.
- Unauthenticated production browser verification passed after the GitHub deployment at `2026-10-10T14:16:11.517Z`: homepage, both recipient pages, direct-link refresh, exact settlement amounts and mobile viewport; no uncaught page errors.

The original public-site report and screenshot are tracked in `deployments/frontend.check.json` and `deployments/frontend-mobile.png`. The later GitHub-build verification report was retained locally at `.tools/vercel-config/github-frontend.check.json` (ignored; may not exist in a fresh clone).

Remaining validation limits: real extension signing on the public HTTPS origin has not been verified by the agent; GitHub Actions results have not been inspected; stateful invariants and adversarial token/reentrancy coverage remain unfinished. The build still warns about a JavaScript bundle over 500 kB. There is no independent security audit.

## 8. Transaction history and receipts (deployed October 11)

Implemented following the user's request to continue, then committed and deployed with their approval. Commit `5f57dd1c0a3910c2575918c5b7fb1a4a98f6b2a7`, production deployment `dpl_Ht7cNXdYBvUd76u8XtRyt2HqYGUL`, is READY at the existing public URL. The HTTPS browser check verified all four events and JSON receipts for each schedule, scanning through snapshot heads 16094353 and 16094354. Each schedule has an expandable **Transaction history & receipts** section; opening it does not require a wallet.

- Shows funding, every claim and cancellation refunds in block/log order, with exact MUSD amounts, UTC block timestamps and explorer links.
- Downloads individual JSON event receipts containing chain/contract/schedule identifiers, transaction and block hashes, log index, raw integer amounts and formatted MUSD. These are event evidence; the explorer provides the network transaction receipt.
- Scans from deployment block `16083735` in 1,000-block RPC chunks, ten chunks per page. Explicit event names ensure the schedule ID is encoded as an indexed RPC filter. Deduplicates by block hash/log index.
- Reports partial coverage and a pinned snapshot head; **Load next blocks** continues scanning, **Refresh history** obtains a new snapshot. RPC failures expose retry and preserve earlier loaded pages. Confirmed app transactions invalidate history.
- The deployment start block is guarded against use with a different contract. A future deployment needs its own verified start block.
- Verified: 14 browser tests, 4 accounting tests, TypeScript and production build passed. The existing bundle-size warning remains. Browser fixtures use both saved real histories and cover ordering, duplicates, exact cancellation/claim amounts, downloads, indexed filters, chunk boundaries, pagination, retry and mobile width.
- Read-only live browser check found all four saved events for each of schedules 1 and 2. First-page coverage was `16083735–16093734`, correctly marked partial against snapshot heads `16094162` and `16094164`. No wallet transactions were requested. Mobile screenshot visually reviewed at `.tools/history-mobile.png` (ignored).

Implementation: `apps/web/src/history.ts`, `apps/web/src/TransactionHistory.tsx`; browser checks: `tests/history.spec.ts`.

Original feature requirements, now implemented:

For each schedule, show:

1. Funding transaction and amount.
2. Every claim, its amount and transaction link.
3. Cancellation, the refunded amount and transaction link.
4. Clearly ordered records with useful timestamps and explorer links.

Existing `ScheduleCreated`, `Claimed` and `Cancelled` events are already in `paymentsAbi`. The inspection script already reads them. Use schedule 1 and 2 as real fixtures and avoid requiring new wallet transactions for development.

Implementation considerations:

- Scan from the verified deployment block in RPC-sized chunks; handle pagination and RPC errors.
- Filter by contract and schedule ID, order by block/log position, and deduplicate records.
- Keep amounts as bigint until formatting; preserve 18-decimal accuracy.
- Avoid labelling a bounded or incomplete scan as complete history.
- Provide loading, empty and retry states; show event evidence rather than invented transaction records.
- Add meaningful browser checks for funding/claims/cancellation history and reconcile against the saved real events.

### CSV export and pending-transaction recovery (deployed October 11)

The user approved implementation and deployment. Commit `6f3b9be` deployed successfully as `dpl_ArwrMycSWXSGEdmqYwfNxks9GyGe` at the existing public URL. Public checks verified full history and CSV/JSON downloads for both schedules through snapshot heads 16094553/16094556. The production recovery panel restored an already confirmed claim across reload, validated it and cleared tracking after acknowledgement; no new transaction was sent.

- **Export loaded history (CSV)** downloads exact formatted MUSD and raw base-unit strings, event/account/transaction/block identifiers, explorer links, UTC timestamps and scan coverage. Partial filenames and per-row metadata identify incomplete scans. Load all blocks for a complete snapshot. Spreadsheet software can round numeric cells when importing, although the CSV file itself retains all digits.
- Approval, funding, claim and cancellation hashes are saved immediately after wallet submission, before waiting for confirmation. Storage is scoped to chain/deployment; submitted address, target and calldata are retained for receipt checks. Storage availability is checked before signing.
- Reloading shows a saved-transaction panel without requiring wallet reconnection. It polls receipts, validates sender/target/calldata/value, distinguishes confirmed, reverted, unknown and differing replacement transactions, and offers the newly funded schedule link when available.
- New submissions pause while a saved transaction is tracked. Acknowledging a checked result refreshes balances/schedules/history. Recovery never signs or resubmits. Recovered approvals require returning to the form and a fresh funding signature/start time.
- Active waits persist replacement hashes through viem's replacement callback. Replacements occurring while the app is closed cannot always be discovered from the old hash; missing receipts remain explicitly unknown. Users can remove a stale tracking record after a confirmation explaining that this does not cancel the transaction and that resubmission may duplicate payment.
- Storage is specific to the browser/origin: localhost and the production site have separate records. Closing before the wallet returns a submitted hash, clearing site storage or switching browsers cannot be recovered by this mechanism. No private keys are stored.
- Validation: 26 browser tests, 4 accounting tests, TypeScript and production build passed. Tests include CSV precision/coverage, pending/success/revert/approval/funding/cancellation/RPC-error/mismatched receipt states, corrupt/foreign storage, and simulated claim/approval submissions surviving reload with zero repeated signing calls. No real wallet transactions were requested.

Implementation: `apps/web/src/pending.ts`, `apps/web/src/PendingTransactionPanel.tsx`, transaction integration in `App.tsx`, CSV helper in `history.ts`; recovery tests in `tests/recovery.spec.ts`.

### Read-only Mezo borrowing (deployed October 11)

The user requested moving to the next feature after deploying CSV/recovery. The borrowing reader and dashboard were deployed from commit `15785c5`, production deployment `dpl_8Ysdu58dE9StFYG1V5RxSAuPKXpb`, READY at the existing public URL. Public browser checks verified both accounts, no page errors and no mobile overflow. Details, pinned source links and addresses are in `docs/borrowing.md`.

- `packages/mezo/src/borrowing.ts` reads verified testnet proxies, checks implementation slots and token/price/oracle bindings, pins all position/price reads to one block, and reconciles the protocol collateral ratio.
- `apps/web/src/BorrowingPosition.tsx` shows collateral, total protocol debt including accrued interest, fixed annual interest, price and liquidation threshold. It reads the connected wallet or any manually entered public address. It never signs borrowing/repayment transactions.
- Stale/invalid prices hide loan health while preserving verified debt. Failed refreshes explicitly label historical data and hide health. Proxy upgrades require reverification. Nonexistent and closed positions have distinct states.
- Official `getEntireDebtAndColl` returns totals already including redistribution. Use collateral/principal/interest once; do not add the pending components again. The fixed annual rate is in basis points. The native oracle uses 18 decimals and reports answeredInRound=0.
- Same-reader RPC evidence: `deployments/mezo-testnet.borrowing.check.json`. Founder at block 16094640: 0.035 BTC collateral, 2001.835158580904771791 MUSD total debt, 0.035158580904771791 MUSD accrued interest, 1% rate. Contractor at block 16094641: no position. These are historical observations. Debt includes a 200 MUSD protocol gas reserve and is not a repayment quote.
- Live local browser check at block 16094671 showed the founder position and 144.7162% collateralization, then correctly switched to the contractor's no-position view at block 16094672. No page errors or horizontal mobile overflow; no new wallet transactions. Evidence and screenshot are ignored at `.tools/borrowing-browser.check.json` and `.tools/borrowing-mobile.png`.
- Validation: 17 unit/accounting tests and 36 browser tests pass, along with TypeScript and the production build. Existing bundle-size warning remains.

### BTC price stress simulator (deployed October 11)

The user requested the next recommended feature. `BorrowingStress.tsx` now displays a 0–100% BTC price-drop slider, preset scenario table and estimated threshold BTC price using the verified active position. `packages/mezo/src/stress.ts` uses bigint arithmetic, upward threshold rounding and exact threshold classification. Snapshot collateral and total debt stay fixed; no future interest or system-wide liquidation modelling. The simulator hides with stale/invalid prices or failed reads, disappears for inactive positions and resets on account changes.

Validation: 21 unit/accounting tests, all 10 borrowing browser cases, TypeScript and production build passed. The existing bundle warning remains. A live local browser check at block 16094855 showed the founder's 144.7665% baseline ratio, 115.8132% at a 20% drop and 72.3832% at a 50% drop. Estimated threshold price was 62914.85 USD, rounded upward to cents. These are historical scenarios, not live quotes. Switching to the contractor at block 16094856 removed the simulator. No page errors, mobile overflow or new wallet transactions. Mobile screenshot visually inspected. Ignored evidence: `.tools/borrowing-browser.check.json`, `.tools/stress-mobile.png`.

The simulator was deployed at the user's request from commit `074ce53`, production deployment `dpl_Chmxg3oKCkU4Mr58qPDowAUEEMNq`, READY at the existing public URL. Public browser verification at block 16094913 confirmed the founder scenarios, a 50% drop below the threshold, and the contractor's no-position state with the simulator absent. No page errors, mobile overflow or new transactions.

### Complete schedule pagination (implemented locally October 11)

After the simulator deployment, the user requested schedule pagination. `apps/web/src/schedules.ts` and the infinite query in `App.tsx` now load 20 IDs per direction per page with no total discovery cap. All pages share one source block. Sent and received offsets advance independently, exhausted directions stop, and merged rows are deduplicated and sorted by ID. Failed ID/detail pages preserve loaded rows and expose a retry button without skipping offsets. Refresh obtains a new head and refreshes loaded pages together; failed refreshes label retained snapshots. Direct schedule links remain available without a wallet.

Funded obligations now count only the connected account's sent schedules, using cancellation entitlement and subtracting claims. Partial discovery is explicitly labelled as a subtotal. Coverage displays unique schedule count, source block/time and partial/complete state. See `docs/schedule-pagination.md`.

Validation: all 42 browser tests, 21 unit/accounting tests, TypeScript and production build passed. Six new pagination cases include 121 sent + 22 received IDs (141 unique), cross-page overlaps, retries for ID/detail failures, exact page boundaries, empty accounts, refreshed snapshots, failed refreshes and account changes. Live local browser reads reconciled schedules 1/2 for the founder at block 16094995 and contractor at block 16094996. No page errors, mobile overflow, signing or transactions. Mobile screenshots visually inspected. Evidence: ignored `.tools/schedules-browser.check.json`, `.tools/schedules-mobile.png`, `.tools/schedules-live-mobile.png`. Existing bundle warning remains.

Next: publish pagination when requested, then explorer source verification, stronger security tests and demo/submission materials. Borrowing and repayment should remain in Mezo until intentionally integrated. Do not estimate debt from wallet MUSD.

Other unfinished work: publish pagination when requested, explorer source verification, stronger security tests, demo/submission materials and any later release review.

## 9. Files to read or edit next

| File | Purpose |
| --- | --- |
| `apps/web/src/App.tsx` | Current dashboard, funding form, schedule reads, claims and cancellation UI |
| `apps/web/src/WalletConnection.tsx` | Wallet discovery and selection |
| `apps/web/src/config.ts` | Public configuration and wagmi setup |
| `apps/web/src/style.css` | Responsive styling |
| `packages/mezo/src/index.ts` | Chain definition, payment ABI and calculation helpers |
| `contracts/src/RunwayPayments.sol` | Deployed payment rules |
| `contracts/test/RunwayPayments.t.sol` | Contract tests |
| `scripts/inspect-schedule.mjs` | Read-only schedule and event inspection |
| `scripts/verify-frontend.mjs` | Public browser verification; writes a tracked report/screenshot |
| `tests/settlement.spec.ts` | Deterministic RPC fixtures for settlement displays |
| `tests/browser.spec.ts`, `tests/wallets.spec.ts` | Other browser tests |
| `.github/workflows/checks.yml` | GitHub CI; copies public `.env.example` before checks |
| `vercel.json` | Source-build commands, output and recipient-route rewrite |
| `README.md`, `docs/frontend-hosting.md` | Setup and current deployment workflow |
| `docs/test-results.md` | Test history; later sections/updates supersede earlier pending statements |
| `wave1Steps.md`, `plan.md`, `issues.md` | Broader project plan and prior review |

## 10. Useful commands

Use Node 24 and pnpm 10.34.6. pnpm is not necessarily installed globally on this machine; the npm wrapper works:

```powershell
# Fresh clone only: install dependencies and create local public configuration.
npm exec --yes --package=pnpm@10.34.6 -- pnpm install --frozen-lockfile
# Copy only if .env does not already exist; preserve existing local settings.
if (-not (Test-Path .env)) { Copy-Item .env.example .env }

# Local development.
npm exec --yes --package=pnpm@10.34.6 -- pnpm dev

# Checks appropriate to the next implementation change.
npm exec --yes --package=pnpm@10.34.6 -- pnpm typecheck
npm exec --yes --package=pnpm@10.34.6 -- pnpm test
npm exec --yes --package=pnpm@10.34.6 -- pnpm test:browser
npm exec --yes --package=pnpm@10.34.6 -- pnpm build
npm exec --yes --package=pnpm@10.34.6 -- pnpm test:contracts

# Read-only chain inspection; rebuild contract artifacts first on a fresh clone.
npm exec --yes --package=pnpm@10.34.6 -- pnpm build:contracts
node scripts/inspect-schedule.mjs 1
node scripts/inspect-schedule.mjs 2
node scripts/verify-frontend.mjs
```

The inspection/verification scripts update evidence files; review their diffs before committing. Native Foundry runs through `scripts/forge.mjs`; WSL was unavailable and is unnecessary.

In the previous agent environment, default shell sandbox setup repeatedly failed with `helper_unknown_error`; reviewed `require_escalated` shell calls worked. That was a tool-environment issue, not a project build failure. Reassess current permissions rather than assuming an old session's tools remain running or authenticated.

## 11. Boundaries and context to preserve

- Testnet assets only; no mainnet release has been requested.
- Never request, export or commit private keys, seed phrases or authentication tokens.
- `.env`, `.tools`, `.publish`, `.vercel`, dependencies, generated builds, Foundry outputs and browser traces are ignored.
- Keep deployment evidence distinct from explorer source verification and an audit.
- Implementation started October 10, before the brief's October 16 build start. Organizer approval for early implementation remains unconfirmed; recorded in `docs/buildathon.md`.
- Do not mark all of Wave 1 complete: history/receipts, CSV/recovery, borrowing reads and price-stress scenarios are deployed; schedule pagination is implemented locally; the other listed work remains.

## Suggested prompt for the next session

> Read HANDOFF.md and inspect the current repository. Continue Runway from the local schedule pagination implementation. Verify or publish it if requested, then work on explorer source verification or stronger security coverage. Keep borrowing/repayment in Mezo and verify any public deployment.
