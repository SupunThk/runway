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
