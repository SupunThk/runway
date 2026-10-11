# Implementation verification — October 10, 2026

## Latest settlement and dashboard checks

Read-only checks at blocks 16084331 and 16084332 confirm schedule 1 fully claimed (1 MUSD) and schedule 2 cancelled and settled (0.628333333333333333 MUSD claimed, 0 claimable). Its cancellation event records a 0.371666666666666667 MUSD sender refund. The contractor balance is 1.628333333333333333 MUSD and the payment contract balance is zero. Updated snapshots are in `deployments/schedule-1.check.json` and `deployments/schedule-2.check.json`.

The dashboard now distinguishes COMPLETED from FUNDED, keeps CANCELLED status after final claims, displays total earned and refunded amounts for cancellations, and hides cancellation after the end timestamp. Schedule and claimable reads share one blockchain block to avoid inconsistent accounting during settlement.

All 12 browser tests and four calculation tests passed; the production build, including TypeScript checks, passed. Three deterministic RPC browser cases cover completed, cancelled with unpaid earned funds, and cancelled with all earned funds paid. The existing bundle-size warning remains. These UI changes do not alter contract rules.

The static frontend was published successfully using the Vercel CLI after the connector rejected new-project creation with HTTP 403. Production URL: https://mezo-runway-testnet.vercel.app. See `docs/frontend-hosting.md`. The sections below preserve earlier test history; their pending payment milestones have been superseded by this verification.

An unauthenticated Playwright check of the production HTTPS site passed the homepage, direct schedule 1 and 2 links, deep-link refresh, exact cancellation refund/earned amounts, and a 390 × 844 mobile viewport with no horizontal overflow or uncaught page errors. Evidence: `deployments/frontend.check.json` and `deployments/frontend-mobile.png`. Real extension signing on the new HTTPS origin remains a user check; the browser verification submitted no transactions.

## User story

A user opens the local Runway workspace, connects MetaMask, reads Mezo testnet balances, and funds or claims a fully backed schedule once a verified payment deployment exists. This session verifies the local contract logic, configuration gate and disconnected browser journey. The funded two-wallet testnet journey is still pending.

| Boundary | Evidence | Status |
|---|---|---|
| TypeScript and production build | `pnpm build` passed | Passed |
| Integer calculation helpers | `pnpm test`: 4 tests passed | Passed |
| Contract logic | `pnpm test:contracts`: 9 tests passed, including 256 accounting fuzz cases | Passed |
| Browser renders | Desktop overview and funding form load with no uncaught page errors in the guarded-form test | Passed |
| Disconnected writes | Funding stays disabled; absent MetaMask produces an install/unlock message | Passed |
| Direct recipient routes | `/schedules/1` loads and survives refresh; unavailable deployment is disclosed | Passed |
| Invalid routes | Malformed schedule URL displays a recovery link | Passed |
| Mobile | 390 × 844 viewport has no horizontal overflow | Passed |
| RPC → token metadata | Chain 31611, block 16082936, official candidate bytecode and metadata recorded | Passed |
| Wallet → real payments | Funded wallets and payment deployment verified in the follow-up; real schedule funding/claim receipts pending | Pending |
| Borrowing → dashboard | Not yet integrated; UI discloses unavailable reads | Pending |
| Public HTTPS hosting | Netlify configuration written; hosting not deployed | Pending |

Contract tests cover atomic allowance/balance failures, input validation, pre-start and final boundaries, partial claims, third-party claims, cancellation authorization, refunds, preserved vested claims, duplicate settlement, rounding and overlapping allocation accounting. Stateful invariants and adversarial token/reentrancy tests remain release requirements.

The build reports a JavaScript chunk over 500 kB. Additional unused wallet SDK dependency branches report peer/deprecation warnings. Bundle optimization and dependency cleanup remain follow-up work; they did not block these checks.

No private key was requested, generated or committed. No real MUSD transfer, contract deployment or testnet payment has been performed.

## Multi-wallet update — October 10, 2026

The browser suite now passes 8 tests. Four additional tests use EIP-1193/6963 simulated providers to verify explicit Rabby and MetaMask selection when both are present, provider deduplication, legacy Rabby discovery, disconnect, rejected-connection recovery, and Escape-key focus restoration. The production build and TypeScript checks also pass.

Real Rabby/MetaMask extension signing and network switching remain pending. These automated tests do not claim to verify installed extension behavior or real transactions.

## Deployment follow-up — October 10, 2026

The user signed the contract deployment in their wallet. The agent verified its receipt, founder, exact local creation bytecode, constructor argument, deployed code and immutable MUSD getter, then configured the application. The read-only integration check verifies both funded wallets and the deployed contract; a transient RPC failure cleared on retry.

A browser check against the actual testnet RPC displayed the founder's 1800 MUSD balance, removed the pending-deployment notice, and enabled schedule creation. This check simulated wallet discovery/connection only and did not request any signing or transfers. Real schedule creation and claiming remain pending.

## Real payment follow-up — schedule 1

Confirmed chain events and token balances at block 16083922 show a 1 MUSD schedule and two successful partial claims totaling 0.46 MUSD, with 0.54 MUSD remaining in the contract. The stored recipient matches the provided contractor address. Creation and claim hashes are documented in `docs/integration-verification.md`; the snapshot is in `deployments/schedule-1.check.json`. Final settlement, claim caller verification and cancellation testing remain pending. These transactions were submitted outside the agent's read-only verification.
# Transaction history and receipts — October 11, 2026

Local implementation passed TypeScript, the production build, all 4 accounting tests and all 14 browser tests. The two new browser cases reconcile schedule 1/2 event fixtures with displayed history and explorer links, verify exact cancellation/claim amounts and downloaded JSON evidence, and exercise deduplication, indexed RPC filters, 1,000-block chunk boundaries, pagination, failed-page retry with earlier records retained, and mobile width.

A read-only local browser check against the live Mezo testnet RPC found all four saved events for each schedule. The first 10,000 blocks were correctly labelled partial (range 16083735–16093734; snapshot heads 16094162 and 16094164). The mobile screenshot was inspected. No new wallet transactions or deployment were performed. The existing JavaScript bundle-size warning remains. Receipts are downloadable contract event evidence; transaction-level network receipts remain accessible through explorer links.

The history feature was subsequently deployed from commit `5f57dd1` to production (`dpl_Ht7cNXdYBvUd76u8XtRyt2HqYGUL`). Public HTTPS checks verified all saved events and JSON receipt downloads for both schedules, including complete pagination through snapshot heads 16094353/16094354, with no uncaught page errors.

## CSV export and pending-transaction recovery — October 11, 2026

Local changes passed all 26 browser tests, 4 accounting tests, TypeScript and the production build. CSV checks verify precise raw/formatted amounts, deduplicated rows and partial/complete scan metadata. Recovery checks exercise pending, success, revert, approval, funding, cancellation, RPC errors, mismatched transaction details, corrupt storage and foreign-chain records. Simulated wallet claim and approval submissions are saved before waiting, survive reload, and cause no repeat signing calls. Recovered funding links to its created schedule; recovered approval does not submit funding. No new real wallet transactions were sent. These changes have not yet been deployed; the existing bundle-size warning remains.

A read-only local browser check also exported CSVs for both live testnet schedules and reconciled all four records per schedule with saved evidence, preserving the exact cancellation refund and raw funding amount. Both scans completed through snapshot heads 16094497/16094500. JSON receipts still passed, there were no uncaught page errors, and the mobile screenshot was visually reviewed.

CSV/recovery was subsequently deployed from commit `6f3b9be` as production deployment `dpl_ArwrMycSWXSGEdmqYwfNxks9GyGe`. Public HTTPS checks verified CSV/JSON downloads and complete history scans through snapshot heads 16094553/16094556. Recovery was verified on the production origin by restoring the already confirmed schedule 2 final claim, reloading, validating its receipt and clearing tracking after acknowledgement. No new transaction was submitted.

## Read-only Mezo borrowing — October 11, 2026

The local borrowing implementation passes 17 unit/accounting tests and all 36 browser tests, TypeScript and the production build. The existing bundle-size warning remains. Coverage includes interest-inclusive debt and redistribution, inactive positions, unsupported upgrades, network/token mismatch, oracle scaling/staleness/negative prices, failed refreshes, threshold warnings and mobile width. The 10 borrowing browser cases also passed after a final mobile-layout adjustment.

The same-reader RPC check is recorded in `deployments/mezo-testnet.borrowing.check.json`. The live local browser read the founder's active position at block 16094671 (0.035 BTC collateral; 2001.835255635715388482 MUSD protocol debt including interest and gas reserve; 1% fixed annual rate; 144.7162% collateralization at the snapshot's price), then correctly switched to the contractor's no-position state at block 16094672. There were no uncaught page errors, no mobile horizontal overflow and no wallet transactions.

Borrowing was subsequently deployed from `15785c5` as production deployment `dpl_8Ysdu58dE9StFYG1V5RxSAuPKXpb`. Public checks verified the founder's active position at block 16094773 and the contractor's no-position state at block 16094774, with no uncaught errors, mobile overflow or new transactions.

## BTC price stress simulator — October 11, 2026

The local simulator passes 21 unit/accounting tests and all 10 borrowing browser cases. TypeScript and production build pass; the existing bundle-size warning remains. The root typecheck/build scripts could not locate nested `pnpm` in this shell, so their web scripts were run directly with `corepack pnpm --filter @runway/web`. Tests cover unchanged baseline, above/equal/below threshold, zero price after a 100% drop, exact integer rounding, invalid inputs, slider keyboard controls, presets, account reset, hidden scenarios for unavailable/stale price and failed refresh, and mobile width. The mobile screenshot was inspected.

A read-only live local browser check used the founder at block 16094855 (0.035 BTC, 2001.835830986782246903 MUSD debt, BTC price 82799.65 USD). It displayed a 144.7665% baseline ratio, 115.8132% at a 20% price drop and 72.3832% at a 50% drop, with estimated threshold BTC price 62914.85 USD rounded up to cents. The contractor at block 16094856 correctly removed the simulator. No uncaught errors, mobile overflow or new wallet transactions. Simulator changes have not yet been deployed.

The simulator was subsequently deployed from `074ce53` as production deployment `dpl_Chmxg3oKCkU4Mr58qPDowAUEEMNq`. Public HTTPS checks at block 16094913 verified the founder's 144.7595% baseline and a 72.3797% hypothetical ratio after a 50% drop, then the contractor's no-position state with no simulator. No page errors, horizontal mobile overflow or new transactions.

## Schedule pagination — October 11, 2026

All 42 browser tests, 21 unit/accounting tests, TypeScript and production build pass. Six new pagination cases load 141 unique schedules from 121 sent and 22 received IDs, verify independent offsets and one-block ID/detail/claimable reads, deduplicate cross-page overlaps, check sender-only obligations and partial subtotals, preserve earlier results after ID/detail failure and retry, probe exact page boundaries, verify empty accounts, refresh into a new block, retain failed-refresh snapshots, switch accounts without old rows, and read arbitrary direct IDs without a wallet. Mobile screenshots were visually inspected; no horizontal overflow. The existing bundle warning remains.

Read-only live local verification reconciled schedules 1/2 for the founder (block 16094995) and contractor (block 16094996) against independent getter reads. No uncaught page errors or wallet signing calls; no new transactions. Pagination is not yet deployed. Details: `docs/schedule-pagination.md`.

Pagination was subsequently deployed from `5bfc3d9` as production deployment `dpl_H7pmgZy2eM5L922hodW5FoKyL5UQ`. Public browser checks reconciled schedules 1/2 and complete coverage for both accounts at block 16095225. No page errors, mobile overflow or new transactions.

## Explorer source verification — October 11, 2026

Foundry/Blockscout returned `Pass - Verified` for the existing RunwayPayments contract. API rechecks confirmed full exact-match verification, main source and all six dependency contents, compiler version/settings and constructor arguments. Preflight reconciled original metadata source hashes, source SHA-256, creation-bytecode hash, indexed creation input/result/founder/block and current RPC deployed-bytecode hash. The old receipt was unavailable from the live RPC during this session; the explorer's indexed successful creation was checked instead. Unauthenticated GitHub checks proved every submitted source file already public before submission approval.

The public browser page displays `Contract Source Code Verified (Exact Match)`, RunwayPayments, Solidity 0.8.28, London, 200 optimizer runs, official MUSD constructor and all source files. Evidence: `deployments/mezo-testnet.explorer.check.json`; standard input and licensed sources are retained under `deployments/verification/`. No contract/frontend code changed in this verification step and no blockchain transaction was submitted. Stronger security tests remain next; exact source matching is not an audit.

## Adversarial and stateful contract tests — October 11, 2026

All 24 Solidity tests pass: 9 existing tests (including 256 accounting fuzz cases), 12 new adversarial tests, two stateful invariants and one deterministic handler exercise. Each invariant completes 128 × 128 calls (16,384) with zero unexpected handler reverts or discards. The handler explores create, time advancement, claims, cancellation, unauthorized cancellation and donations across three actors and up to 32 schedules. An independent model checks immutable fields, accrued/frozen entitlement, claims, refunds, escrow, obligations, actor balances and discovery. The final-settlement hook proves every remaining entitlement can be paid, leaving only donated surplus and zero obligations.

Adversarial coverage includes all nine write-entry reentrancy combinations, short/fee funding, false ERC-20 returns, reverting payout/refund calls, transaction rollback and retry, permissionless recipient-only claims, claim/cancel ordering, donations, no-return tokens, full-precision arithmetic with an overflowing intermediate product, invalid calls and 105-ID discovery. Detailed scope: `docs/security-testing.md`; machine-readable results: `deployments/security-tests.check.json`.

Production source SHA-256 and creation-bytecode hash remain identical to the deployed artifact. Production source/frontend files were unchanged, so browser/build checks were not repeated for these test-only additions. CI already runs the full Solidity suite. No new transactions or deployment. This coverage is not an independent audit.
