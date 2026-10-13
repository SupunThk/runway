# Runway project handoff

## Active scope update — October 13, 2026

Hosting decision updated after the backend increment: the user chose Render for the Node API, keeping the frontend on Vercel and database in Atlas. Cloud MongoDB ping and index initialization succeeded with the user's `.env` after DNS troubleshooting; credentials were never printed. `render.yaml`, PORT/0.0.0.0 listener support and a frontend proxy-configuration script are prepared. The previous Vercel API adapter is removed. No Render service or hosted backend has yet been created or verified. Read `docs/render-hosting.md`; actual Render access and service URL are required for deployment and proxy activation.

The user approved MongoDB and expanding Wave 1. Local work adds a TypeScript/Hono API, pooled MongoDB access/indexes, EOA wallet-message authentication, owner-private workspaces, contractor directory, draft invoices and `/workspace`, with prefilled links into the existing funding form. User database credentials will be added by the user to root `.env` after this increment. No live-database verification, commit, push or deployment is implied.

Read `docs/backend.md` for configuration and `docs/development-workflow.md` for the current roadmap. Former Wave 2 borrowing/repayment, planning, Passport, reusable helpers and pilots are now Wave 1 targets, still unimplemented where not explicitly recorded. Indexing and confirmed invoice/payment reconciliation remain upcoming. Wave 2 expands into payroll operations, contractor submissions, approvals, forecasting, team roles/multisig and notifications. Original backend-free scope and deferrals below are historical and superseded by this revision.

Local verification passed: 30 unit/API tests (including nine against temporary MongoDB), all 44 browser cases, TypeScript, backend/frontend build, formatting and whitespace checks. The browser flow covers login, persisted workspace/contractor/invoice creation, reload recovery and exact payment prefilling; rejected signing remains recoverable. The 390px workspace screenshot was visually reviewed without horizontal overflow. Tests use temporary databases and simulated wallets, not the user's MongoDB account or real signing. The existing bundle-size warning remains. CI caches the isolated MongoDB test binary. No contract changes, transactions or deployment occurred.

Preserve the pre-existing local handoff content. The historical browser CI failure remains unresolved; current local check results will be recorded in `docs/test-results.md`. Existing payment contract and production release remain unchanged until an authorized release is ready. After the user configures MongoDB, verify local persistence, then hosted routing/cookies/database access before deployment. Keep backend values server-only, without VITE_ prefixes.

Updated October 11, 2026. Read this first when continuing in a new session. This records completed work and verified results; balances and deployment checks are historical snapshots.

## End-of-day status — October 11

- User finished for the day and requested this handoff update. Do not continue feature work or redeploy as part of this update.
- Latest committed and pushed application release: `b309e7b08f4f62909460f7f15751ed96a964c8c9` (`Add Runway user documentation and downloadable guide`), on `main`.
- Production deployment `dpl_EMyR7AMmss43ipT1xsAwPDqd4ijS` is READY and assigned to https://mezo-runway-testnet.vercel.app. Deployment URL: https://mezo-runway-testnet-4uvg5s1l9-supunthks-projects.vercel.app.
- User documentation is live at https://mezo-runway-testnet.vercel.app/docs. Unauthenticated public browser checks passed for `/docs` and `/docs/`, section links, the identical Markdown download, navigation to/from New schedule, 390px/320px mobile layouts without overflow, and no page errors. Reading the guide required neither a wallet nor Mezo RPC requests.
- **First next-session task: investigate the failed GitHub browser-test step.** [CI run 38117460629](https://github.com/SupunThk/runway/actions/runs/38117460629) completed with failure in `Run pnpm test:browser`. Earlier typecheck, unit-test, build and contract-test steps passed. The exact failing browser case/cause has not been investigated. Do not describe this release as having all CI checks passing. Vercel deployment is not gated on CI, so production is live despite this failure.
- Previous release `797c910` passed all CI checks, including browser tests. Use it as the comparison baseline; do not assume the new failure's cause.
- Core Wave 1 implementation is complete: funded schedules, claims/cancellation, history/receipts, CSV/recovery, read-only borrowing, BTC scenarios, schedule pagination, explorer source verification, adversarial/invariant tests, and user documentation.
- Full Wave 1 release work remains: demo video/submission materials, final release review/tag, final hosted two-wallet extension validation, and external confirmations (registration/Discord, deadline timezone, and early-work eligibility). Earlier real on-chain payment tests are already complete; do not repeat them just to recover context.
- A separate backend is not required for Wave 1. Prioritize a clear complete payment demonstration before adding scope. Borrowing and repayment remain in Mezo.
- This handoff-only update is saved locally after the deployed commit; it has not been committed or pushed. Inspect `git status` before the next change.

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

Latest deployed application commit: `b309e7b` (user documentation). The initial implementation commit was `8a58ef1`. Run `git status` and `git log` at the start of the next session; handoff updates can remain local after an application release.

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

Deployment block: `16083735`. Successful receipt, founder, exact local creation bytecode, constructor MUSD argument, deployed code and immutable token getter were verified. Explorer exact-match source verification is complete; see `docs/explorer-verification.md`. An independent audit has not been performed. Reuse this contract for the current app; another deployment is unnecessary for ordinary frontend work.

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

Latest confirmed GitHub deployment:

- ID: `dpl_EMyR7AMmss43ipT1xsAwPDqd4ijS`
- Source: GitHub, `SupunThk/runway`, branch `main`
- Commit: `b309e7b08f4f62909460f7f15751ed96a964c8c9`
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

The counts above describe the initial release. The Solidity suite now passes 24 tests with adversarial token/reentrancy coverage and two stateful invariant campaigns; the previous release passed 42 browser tests and 21 unit/accounting tests in CI. For the latest documentation release, the GitHub browser-test step failed and requires investigation (see end-of-day status); its earlier checks passed. Real extension signing on the final public HTTPS origin remains unverified by the agent. The build still warns about a JavaScript bundle over 500 kB. There is no independent security audit.

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

### Complete schedule pagination (deployed October 11)

After the simulator deployment, the user requested schedule pagination. `apps/web/src/schedules.ts` and the infinite query in `App.tsx` now load 20 IDs per direction per page with no total discovery cap. All pages share one source block. Sent and received offsets advance independently, exhausted directions stop, and merged rows are deduplicated and sorted by ID. Failed ID/detail pages preserve loaded rows and expose a retry button without skipping offsets. Refresh obtains a new head and refreshes loaded pages together; failed refreshes label retained snapshots. Direct schedule links remain available without a wallet.

Funded obligations now count only the connected account's sent schedules, using cancellation entitlement and subtracting claims. Partial discovery is explicitly labelled as a subtotal. Coverage displays unique schedule count, source block/time and partial/complete state. See `docs/schedule-pagination.md`.

Validation: all 42 browser tests, 21 unit/accounting tests, TypeScript and production build passed. Six new pagination cases include 121 sent + 22 received IDs (141 unique), cross-page overlaps, retries for ID/detail failures, exact page boundaries, empty accounts, refreshed snapshots, failed refreshes and account changes. Live local browser reads reconciled schedules 1/2 for the founder at block 16094995 and contractor at block 16094996. No page errors, mobile overflow, signing or transactions. Mobile screenshots visually inspected. Evidence: ignored `.tools/schedules-browser.check.json`, `.tools/schedules-mobile.png`, `.tools/schedules-live-mobile.png`. Existing bundle warning remains.

Pagination was deployed at the user's request from `5bfc3d9`, production deployment `dpl_H7pmgZy2eM5L922hodW5FoKyL5UQ`, READY at the existing public URL. Public browser checks reconciled schedules 1/2 for both accounts at block 16095225 with no page errors, mobile overflow or new transactions.

### Explorer source verification (completed October 11)

The user requested beginning the next step after deploying pagination. RunwayPayments is now exact-match verified on the public Mezo testnet explorer. Blockscout confirmed full verification at `2026-10-11T04:46:08.009609Z`; API fields are verified=true, fullyVerified=true, partiallyVerified=false. Public browser page confirmed the exact-match banner, source, ABI, Solidity 0.8.28, London, 200 optimizer runs and official MUSD constructor. No new blockchain transactions.

Reproduction: `node scripts/verify-explorer.mjs` checks without submission; `--submit` publishes matching public source. The script generates standard JSON and verifies every source hash against the original metadata, original source/creation hashes, indexed successful creation transaction and live RPC code. The RPC returned no old creation receipt during this session, so indexed creation evidence was used. Initial automatic approval review rejected publication as nonpublic source; unauthenticated GitHub checks proved all seven exact files already public, after which the same submission was approved. No action remains blocked.

Evidence: `deployments/mezo-testnet.explorer.check.json`, `deployments/verification/RunwayPayments.standard-input.json`, `deployments/verification/public-source-check.json`; source license notices and official `OpenZeppelin.LICENSE` preserved. Blockscout's separate license metadata is `none`, while source SPDX declarations are MIT. Details: `docs/explorer-verification.md`. Ignored public browser screenshot: `.tools/explorer-verified.png`.

### Adversarial/stateful contract security tests (completed locally October 11)

The user requested the next security step. Added `contracts/test/RunwaySecurity.t.sol` (12 adversarial cases) and `contracts/test/RunwayInvariant.t.sol` (two independent-model invariant campaigns plus a deterministic handler exercise). `contracts/foundry.toml` now sets invariant runs=128, depth=128 and fail_on_revert=true. All 24 Solidity tests pass, including the original 256-case accounting fuzz test. Each invariant made 16,384 handler calls with zero unexpected reverts/discards.

Adversarial cases test all nine cross-entry reentrancy combinations, fee/short funding, false/reverting transfers with full rollback/retry, caller-independent recipient-only claims, claim/cancel ordering, donations, no-return ERC-20 behavior, overflowing intermediate vesting arithmetic, invalid inputs/IDs and pagination over 100 IDs. The stateful handler models up to 32 schedules across three actors, tracking deposits, claims, refunds and donations independently of contract state. Invariants check escrow/obligation/global actor conservation, immutable fields, freeze/rounding behavior and discovery. `afterInvariant` advances through all ends and pays every remaining entitlement, proving zero obligations and only donated surplus remains. CI already runs these tests.

Evidence: `deployments/security-tests.check.json`; details and limits: `docs/security-testing.md`. Final-run source SHA-256 and creation-bytecode hash match the original deployment. No production source/frontend changes or blockchain transactions. The user requested committing and pushing the tests, verification evidence and documentation to main; inspect git status/log for publication status. CI runs the full test suite, and the GitHub integration rebuilds the frontend on a main push. Ignored runner/raw output: `.tools/run-security-check.mjs`, `.tools/security-tests.raw.json`.

Next: demo/submission materials and release review. Borrowing and repayment should remain in Mezo until intentionally integrated. Do not estimate debt from wallet MUSD. These local tests and exact source verification are not an independent audit.

## 9. Files to read or edit next

| File | Purpose |
| --- | --- |
| `apps/web/src/App.tsx` | Current dashboard, funding form, schedule reads, claims and cancellation UI |
| `apps/web/src/WalletConnection.tsx` | Wallet discovery and selection |
| `apps/web/src/config.ts` | Public configuration and wagmi setup |
| `apps/web/src/style.css` | Responsive styling |
| `apps/web/src/Documentation.tsx`, `apps/web/src/guide.ts` | Public documentation page and shared guide content |
| `docs/user-guide.md`, `scripts/export-user-guide.mjs` | Generated repository guide; regenerate with `pnpm docs:generate` |
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
- Do not mark all of Wave 1 complete: history/receipts, CSV/recovery, borrowing reads, price-stress scenarios and pagination are deployed; explorer verification and local adversarial/stateful tests are complete; submission materials, release review and external confirmations remain.

## User documentation deployed (October 11)

Added a wallet-free `/docs` page linked from the app sidebar, covering setup, founder funding, contractor claims, cancellation with a worked example, paginated overview, history/JSON receipts/CSV, read-only borrowing/scenarios, pending recovery and release limits. Shared content in `apps/web/src/guide.ts` powers both the page and Markdown download; `pnpm docs:generate` writes `docs/user-guide.md` through `scripts/export-user-guide.mjs`. README links to the user guide. Vercel rewrites now include `/docs` and `/docs/` for direct visits.

Validation: production TypeScript/Vite build passed. Local production-preview browser checks passed for both documentation routes, anchor links, identical Markdown download, navigation to/from New schedule, 390px/320px layouts without overflow, and no page errors. Documentation made no Mezo RPC requests and required no wallet. Desktop/mobile screenshots were visually inspected. Ignored checker/screenshots: `.tools/verify-user-guide.mjs`, `.tools/user-guide-desktop.png`, `.tools/user-guide-mobile.png`.

Committed and pushed as `b309e7b`, then deployed through the normal GitHub `main` workflow as `dpl_EMyR7AMmss43ipT1xsAwPDqd4ijS`. The public `/docs` and `/docs/` page checks, Markdown download and navigation passed, including mobile layouts and no page errors. The fallback static-hosting preparation also includes both docs routes. Payment contract and transaction behavior were not changed. The full GitHub browser-test step subsequently failed; investigate it next session before further release work.

## Suggested prompt for the next session

> Read HANDOFF.md and inspect the current repository. User documentation is deployed as b309e7b and its public smoke checks pass, but GitHub CI run 38117460629 failed at the browser-test step. Investigate the failing case first, then continue with demo/submission materials and release review. Preserve the verified production contract, keep borrowing/repayment in Mezo and verify any public deployment. The latest handoff update may be uncommitted locally.

## Render deployment session — October 13, 2026 (hosted verification pending)

User authorized deploying the prepared backend to Render while retaining the Vercel frontend. Release checks passed again: 30 unit/API tests, 44 browser tests, TypeScript, formatting, build and git diff whitespace. Prepared source committed and pushed to `deploy/render-backend-2026-10-13` as `023087f`; main remains `b309e7b`. Local MongoDB URI is present; no URI appears in frontend build assets. Never print the URI.

User confirmed My Workspace (`tea-d7p2hoa8qa3s73et5nl0`). Created free Singapore Node service `runway-api`, ID `srv-db75jus9v7es73ai4g00`, URL https://runway-api-rw61.onrender.com. Deployment `dep-db75jvs9v7es73ai4ibg` is live from backend commit `023087f` on `deploy/render-backend-2026-10-13`. MongoDB values transferred directly from ignored local `.env`; APP_ORIGIN is the existing Vercel production origin. Direct HTTPS `/api/health` returned 200 ready/database connected; logs confirm 0.0.0.0:10000 startup. Created with the MCP tool, so it uses commit-triggered auto-deploy on the deployment branch and default TCP health checks (MCP cannot set an HTTP health path); `render.yaml` describes the intended Blueprint settings, not an applied Blueprint. Browser UI was unavailable to adjust this. HTTP health is verified explicitly.

Vercel MCP still returns 404 for the known project. Authenticated CLI 54.9.1 successfully inspected `supunthks-projects/mezo-runway-testnet` and confirmed project `prj_xVu0NEGFRc47pJFYnZI87erHvqoX`, Node 24.x and existing build settings. Use CLI fallback or the Git main workflow after Render is healthy and `scripts/configure-api-proxy.mjs` has the real Render URL.

Ignored `.tools/verify-render-release.mjs` is prepared and syntax checked. It exercises the real HTTPS frontend/API/Atlas with newly generated test-wallet message signatures, checks Secure/HttpOnly/SameSite=Strict cookies, persistence, owner isolation, replay rejection, exact payment prefilling and logout. It removes only its own generated wallet records. It has NOT run yet. Real installed-wallet extension signing remains a separate user validation. Historical CI failure 38117460629 is still uninvestigated (`gh` is unavailable); do not claim all CI is green.
