# Security policy and threat model

> [!WARNING]
> Testnet prototype. **Not audited.** Do not use with mainnet funds.

## Scope and deployments

This policy covers Runway's payment contract, browser application, workspace API, payment indexer and documentation assistant. Reviewed October 20, 2026. Explorer verification establishes source correspondence, not security assurance.

| Deployment | Mezo testnet (chain 31611) |
| --- | --- |
| RunwayPayments | [`0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D`](https://explorer.test.mezo.org/address/0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D?tab=contract), exact-match source verified |
| MUSD | [`0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`](https://explorer.test.mezo.org/address/0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503?tab=contract) |

RunwayPayments uses Solidity **0.8.28**, OpenZeppelin **5.0.2**, optimizer 200 runs and the **London EVM** target. See [compiler configuration](contracts/foundry.toml), [pinned dependencies](package.json) and [deployment verification](docs/explorer-verification.md). These versions describe RunwayPayments, not the separate MUSD implementation.

## Contract invariants

These properties assume the external token maintains standard ERC-20 balances and transfers, without externally burning/rebasing the escrow. They are enforced by the stated code and checked by bounded tests; they are not formally proven for every token behavior.

| Property | Enforcement and evidence |
| --- | --- |
| Escrow MUSD balance is at least `outstandingObligations`; donations remain surplus | [Funding/claim/cancel accounting](contracts/src/RunwayPayments.sol#L49-L86); [`invariant_modelAccountingAndSolvency`](contracts/test/RunwayInvariant.t.sol#L205-L222) independently checks exact obligations and escrow plus donations. |
| Per schedule, `claimed <= vested <= total`; cancellation freezes vested entitlement at `vestedAtCancellation` | [Vesting](contracts/src/RunwayPayments.sol#L108-L113), [claim/cancel](contracts/src/RunwayPayments.sol#L64-L85); [model assertions](contracts/test/RunwayInvariant.t.sol#L205-L222) and [`testCancellationPreservesVestedEntitlement`](contracts/test/RunwayPayments.t.sol#L90). |
| Claims pay the original recipient regardless of caller; no recipient-edit path exists | [`claim`](contracts/src/RunwayPayments.sol#L64-L71), [stored schedule creation](contracts/src/RunwayPayments.sol#L57); [`testPermissionlessClaimPaysOnlyImmutableRecipient`](contracts/test/RunwaySecurity.t.sol#L169). |
| Only the sender can cancel, once, before `end`; refund is `total - vested(at cancellation)` | [`cancel`](contracts/src/RunwayPayments.sol#L74-L85); [`testAuthorizationAndEndCancellation`](contracts/test/RunwayPayments.t.sol#L114), [cancellation freeze test](contracts/test/RunwayPayments.t.sol#L90) and [ordering test](contracts/test/RunwaySecurity.t.sol#L183). Cancellation can occur before accrual starts. |
| Creation receives the full amount upfront; short/fee-on-transfer funding reverts atomically | [`UnsupportedToken` balance-delta check](contracts/src/RunwayPayments.sol#L49-L61); [`testFeeOnFundingRevertsAllStateAndBalances`](contracts/test/RunwaySecurity.t.sol#L96) and [false-return test](contracts/test/RunwaySecurity.t.sol#L108). This does not establish compatibility with every outgoing-fee or rebasing token. |
| Every external write entry has `nonReentrant`; claims/refunds update accounting before outgoing transfers | [All three write functions](contracts/src/RunwayPayments.sol#L49-L86); [`testAllWriteEntryPointsRejectTokenReentrancy`](contracts/test/RunwaySecurity.t.sol#L144) covers all nine outer/inner combinations. Creation intentionally receives and verifies tokens before recording a new schedule, under the reentrancy guard; it does not follow a blanket effects-before-interactions order. |
| No owner/admin, upgrade, pause, fee or arbitrary-withdrawal entry exists in RunwayPayments | [Entire contract](contracts/src/RunwayPayments.sol), including its immutable `musd` binding and its only write functions: create, claim and cancel. The external MUSD token has separate privileged roles described below. |
| Linear vesting rounds down using full-precision `Math.mulDiv`, retaining fractional units for the sender until `end`; at `end`, the entire total vests | [`vested`](contracts/src/RunwayPayments.sol#L108-L113); [`testPartialClaimsAndFinalRounding`](contracts/test/RunwayPayments.t.sol#L69), [overflow case](contracts/test/RunwaySecurity.t.sol#L224). |
| Discovery page limit cannot exceed 100 | [`page`](contracts/src/RunwayPayments.sol#L115-L121); [limit/unknown-ID test](contracts/test/RunwaySecurity.t.sol#L248), [105-schedule boundary test](contracts/test/RunwaySecurity.t.sol#L262). |

## Trust assumptions

**MUSD and its privileged roles.** Read-only inspection at testnet block **16260633**, October 20, 2026, found zero EIP-1967 implementation, admin and beacon slots. The [explorer's verified MUSD source](https://explorer.test.mezo.org/address/0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503?tab=contract) reports no proxy type or implementations and exposes no upgrade function. This is evidence for this deployment, not a blanket claim that every Mezo contract is immutable. Its owner was `0x123694886DBf5Ac94DDA07135349534536D14cAf`; this review does not establish who controls that address. The source permits the owner to manage mint/burn allowlists and system-contract roles. Authorized burners can burn from a supplied account without an ERC-20 allowance, so token-level privileges can affect escrow solvency. Runway cannot prevent that. Do not assume an independently verified governance or multisig arrangement. The [borrowing integration](docs/borrowing.md) separately validates upgradeable manager/feed implementations.

**Chain and RPC.** Vesting depends on validator-controlled `block.timestamp` and canonical chain execution. RPC providers can be unavailable, stale or dishonest. UI snapshots are observations, and the indexer's 12-block confirmation policy is not irreversible finality. The [reconciliation design](docs/payment-reconciliation.md) hides stale evidence and rebuilds after checkpoint mismatches.

**Oracle and borrowing.** Read-only borrowing views trust Mezo's protocol/oracle behavior after deployment, price, timestamp and accounting checks. The planner uses wallet cash and funded schedules plus a separate borrowing-capacity estimate; it does not execute loans. Price stress, unchanged rates and immediate renewal are assumptions, not promises. See [planner formulas and limitations](docs/borrowing.md#runway-planner).

**Hosting and providers.** Vercel serves frontend code and proxies API requests; Render runs the API/indexer; MongoDB Atlas stores workspace/authentication/index data. Compromise or outage of those providers can affect privacy, availability and the interface offered to a wallet. Gemini processes assistant questions and bounded public context; its independent processing/retention policies apply. Browser extensions, wallet software and the user's device must also be trusted. A wallet signature or transaction must be reviewed in the wallet itself.

## Off-chain threat model

| Asset | Threat | Mitigation in code | Residual risk |
| --- | --- | --- | --- |
| Wallet login and sessions | Forged login, replay or stolen session | [Server-generated SIWE challenges](apps/api/src/app.ts#L339-L411) bind origin/domain and chain, expire in five minutes and are consumed atomically. Random 256-bit session tokens are stored as SHA-256 hashes; one-day, HttpOnly, SameSite=Strict cookies are Secure on HTTPS. Expiration is checked on requests, independently of TTL cleanup. Logout revokes the current token. | EOA wallets only. Compromised devices or same-origin code can act as the user. Disconnecting a wallet hides mismatched workspace access but does not revoke a server session; use logout. |
| API mutations | Cross-site requests and oversized inputs | [Exact Origin checks](apps/api/src/app.ts#L205-L222) on methods other than GET/HEAD; no-store responses, security headers, 16 KiB body cap and field validation. | Origin checks do not authenticate arbitrary HTTP clients or protect against same-origin compromise. |
| API availability and inference quota | Distributed abuse and excessive model use | [MongoDB-backed atomic rate counters](apps/api/src/app.ts#L142-L173), per-wallet/global auth limits and authenticated mutation limits. Assistant: six/client hint/minute, 30 global/minute, configurable daily cap (default 200 requests), two concurrent calls per process and 45-second deadline. | Client hints can be spoofed; concurrency is per process. Caps count requests, not dollars, and failed inference consumes budget. Hosting limits and provider billing controls still apply. |
| Private workspace records | Cross-owner access, forged nested references | [Owner-filtered workspace queries and nested ownership middleware](apps/api/src/app.ts#L438-L484); invoice creation checks the contractor belongs to that workspace. [Database indexes](apps/api/src/db.ts) enforce reference and schedule-link uniqueness. | Hosting/database operators and an attacker with a valid owner session can access records. There are no shared team roles or contractor logins. |
| Invoice metadata and payment evidence | Onchain disclosure or false payment association | [Random 32-byte references](apps/api/src/app.ts#L602-L609) omit business names/descriptions/IDs. [Matching/linking](docs/payment-reconciliation.md) checks sender, recipient, exact original amount and confirmed indexed state. | References are opaque, not secret; addresses, timing, amounts and references remain public and correlatable. Funding does not prove the recipient has claimed. Reorgs/indexer delays can invalidate observations. |
| Assistant context and output | Prompt injection, fabricated sources, private-data access | [Strict request schema, fresh bounded context, selected public sections, fixed refusals and validated source/link IDs](apps/api/src/assistant.ts). No wallet, RPC, database, browsing or transaction tools are exposed to the model; workspace records/session secrets are not supplied. Only prior user questions enter follow-up context. | Model-based classification and instructions do not mathematically prevent all prompt injection or incorrect answers. Questions go to Gemini; do not submit secrets. The app does not persist chat transcripts, but provider policies are separate. |
| Frontend configuration and pending transactions | Exposed secrets, lost recovery state or storage tampering | Only public configuration belongs in `VITE_*`; provider/database credentials remain server-side. [Versioned pending records](apps/web/src/pending.ts) in localStorage are scoped to chain/contract and validated before use; receipts and transaction details are inspected by [the recovery panel](apps/web/src/PendingTransactionPanel.tsx). | localStorage is accessible to same-origin code, can be cleared/edited, and is neither a wallet nor authoritative proof. A lost record does not cancel a transaction. Malicious frontend code can present misleading signing requests. |
| Backend availability | Sleeping/free hosting, gateway HTML, network timeouts or database outage | [Bounded request classification](apps/web/src/api.ts), [90-second wake polling](apps/web/src/hooks/useBackendWake.ts), explicit retry/database messages, and once-per-tab Overview prewarming. [Judging-window health pings](.github/workflows/keepalive.yml) need no secrets. | Polling cannot repair service/database failures. Schedules and payments depend on chain RPC, while workspace/assistant/indexing availability depends on the backend. GitHub schedules are best-effort; pings are not an SLA. |

## Known limitations and out of scope

- Direct token donations are unrecoverable surplus: there is no sweep or arbitrary withdrawal. See [donation test](contracts/test/RunwaySecurity.t.sol#L199).
- Anyone can fund schedules to a valid recipient, including unsolicited schedules. Recipient lists can be spammed; discovery is paginated.
- Schedules cannot be edited; the recipient and original payment terms cannot be changed after creation. Cancellation follows the fixed rules above.
- No independent audit or formal verification has been performed. Mock-token tests do not prove every external MUSD behavior.
- Borrowing remains read-only in Runway. Planner results exclude fees, minimum debt, gas compensation on new debt, future interest and system-wide recovery conditions; future-starting schedules are excluded from current-rate coverage.
- Render free-tier sleep pauses the embedded indexer. Waking the backend does not imply its payment checkpoint is current.
- Mainnet use is outside the supported scope. Real installed-wallet signing and setup remain separate user validation.

## Testing evidence

On October 20, 2026, `node scripts/forge.mjs test --root contracts` passed **24 tests**: nine payment tests (including the 256-case accounting fuzz test), 12 adversarial tests and three invariant-suite entries. Those three include a deterministic handler exercise and **two stateful invariant campaigns**, each with 128 runs × 128 calls (16,384 handler calls), zero unexpected reverts and zero discards. The model checks solvency, allocation, immutability, discovery and final settlement independently of contract getters.

See [security-testing details](docs/security-testing.md), [payment tests](contracts/test/RunwayPayments.t.sol), [adversarial/reentrancy tests](contracts/test/RunwaySecurity.t.sol), [invariant model](contracts/test/RunwayInvariant.t.sol) and the [Checks CI workflow](.github/workflows/checks.yml). CI runs TypeScript, unit/API/frontend tests, the production build, Foundry and simulated-wallet browser tests. Local passing tests are evidence for this revision; remote CI must pass on the released commit separately.

## Reporting a vulnerability

Use GitHub private vulnerability reporting for [`SupunThk/runway`](https://github.com/SupunThk/runway/security/advisories/new) (Security → Advisories → Report a vulnerability). Include the affected revision/deployment, reproduction steps and expected versus observed behavior. Do not include private keys, session tokens or real credentials. If the private form is unavailable, obtain a private reporting contact from the maintainer before sharing exploit details publicly.

<!-- TODO(user): add contact email -->
