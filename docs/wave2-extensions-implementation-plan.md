# Wave 2 extensions implementation plan

Prepared October 30, 2026 from [scope_update.md](scope_update.md), with the current repository reviewed for integration points. This plan covers F3 funding proof, F1 client payment links, and F2 milestone escrow. It supplements the existing Wave 2 backlog; it does not schedule or implement that backlog.

Status: planning complete; feature implementation and baseline verification have not started.

## Delivery sequence

| Phase | Deliverable | Dependency | Exit gate |
| --- | --- | --- | --- |
| 0 | Verified baseline and settled implementation decisions | None | Existing checks recorded; design gaps below resolved |
| 1 / F3 | Wallet-free funding proof for time-based schedules | Phase 0 | Complete, pinned reads; honest partial states; route tests |
| 2 / F1 backend | Payment requests, public API, verifier, settlement uniqueness | Phase 1 | Privacy, concurrency, expiry and verification tests |
| 3 / F1 frontend | Receivables workspace tab and public payer flow | Phase 2 | Pending recovery and end-to-end simulated payment |
| 4 / F2 contract | Tested RunwayMilestones and deployment tooling | Phase 3 | Contract unit, fuzz, invariant and deployment dry-run checks |
| 5 / F2 deployment | User deploys and signs through browser wallet | Phase 4 | Verified deployment address and evidence supplied |
| 6 / F2 app | Escrow forms, details, invoices, ledger and receipts | Phase 5 | Escrow workflows and disabled-feature regression pass |
| 7 / F3 extension | Funding proof includes milestone escrows | Phase 6 | Both contract totals share one snapshot block |
| 8 | Documentation and release evidence | Phase 7 | Full checks and manual testnet evidence recorded |

Implement sequentially in this order. Phase 5 is a deliberate external dependency: stop after preparing deployment tooling until the user has deployed the new contract. Keep payment links and schedule-only proof independently usable before milestones are configured.

## Constraints and current integration points

- Preserve the user's untracked `docs/scope_update.md`; no other local changes were shown by the planning-time status check. Recheck before implementation.
- Never read, print, edit or commit `.env`. Document settings in `.env.example`. Existing scripts that load `.env` must not be invoked during unattended verification; use isolated test settings or a no-secret dry-run path.
- Leave `contracts/src/RunwayPayments.sol` and its deployment manifest unchanged. Preserve existing tests, handoff history, evidence and ignored tooling.
- No commits, pushes, tags, deployments or transactions are authorized by this planning task. Deployment and release actions require a subsequent explicit instruction.
- Use pnpm 10.34.6 and Node 24, existing Hono/MongoDB conventions, viem, bigint accounting, decimal-string API amounts, lazy React routes and existing CSS files.
- `direct-payments.ts` currently returns a status string and requires an owner argument. Preserve this interface for existing invoice callers/tests while adding a richer internal verifier for payment requests and receipts.
- `db.ts` currently enforces payment-key uniqueness only inside invoices. This is insufficient for uniqueness across the new collection.
- `readSchedulePage()` already pins pagination to a block, but reads both sent and received schedules and fails a whole page if one row fails. The proof loader needs sender-only discovery and per-row failure handling.
- Public routes must precede the session middleware in `app.ts`; reuse the existing origin checks, safe errors and database-backed rate limiting.
- Update `Router.tsx`, Vercel rewrites and the applicable Netlify/static export verification lists together for every new public route.

## Phase 0: baseline and implementation decisions

1. Recheck repository instructions, working-tree status, installed tools and test configuration. Record existing changes without reverting them.
2. Run the verification set below against isolated fixtures and capture actual test counts. Historical handoff counts are reference material, not a current green baseline.
3. Resolve the following specification gaps before building the affected phase. These are proposed clarifications, not silent changes to the source brief.

### Settlement uniqueness must be atomic across collections

The brief's cross-collection lookup plus separate unique indexes allows concurrent invoice/request writes to both succeed. Introduce a shared settlement-claim collection keyed uniquely by the canonical payment key. Store target type, target ID and workspace ID; reserve the key before linking either document. The key for direct transfers is `${chainId}:${musdAddress}:${transactionHash}`: `token` here means the MUSD contract address, not the public payment-link token. Escrows use `${chainId}:${milestonesAddress}:${escrowId}`.

Use the shared claim as the authoritative ownership record. Make same-target retries idempotent and able to finish a document update after a crash. Never release a reservation just because RPC is temporarily unavailable. Define recovery for abandoned unverified claims so an invalid submitted hash cannot permanently reserve a transfer. Prefer reserving only after transaction identity, recipient and amount are verified; awaiting-confirmation reservations must have an explicit retry/recovery policy. Backfill claims from existing invoice payment keys before enabling request settlement; detect conflicts and stop rather than overwrite them. Test concurrent invoice/request linking, not only sequential duplicates.

### Expiry and pending settlement need one consistent rule

The brief rejects linking expired requests, but also accepts transfers mined before expiry and expects recovery after 12 confirmations. A payment mined just before expiry may only become confirmable afterward. Proposed rule: expiry disables new payment initiation; a matching transfer mined within `[createdAt, expiresAt]` remains eligible for verification after expiry. A cancelled request rejects new links; cancellation and linking use atomic state guards so they cannot both win. This expiry clarification needs agreement before F1 implementation because it changes the literal expired-link rejection requirement.

Specify status precedence: verified paid wins over expiry; a valid linked hash awaiting confirmations remains awaiting confirmation across expiry; cancellation prevents new settlement; RPC failure returns unavailable without erasing the hash or suggesting another transfer. Block timestamps, rather than browser time, determine transfer eligibility. Do not replace the current 12-block confirmation convention without an explicit change.

### Receipts and verifier compatibility

The public GET whitelist omits payer and block, although the UI requires both for its receipt. Keep GET's strict whitelist. Return verified public receipt metadata from the payment-verification POST, and recover it after reload by retrying the stored/returned transaction hash. Include chain/token, hash, payer, payee, amount, block number/hash, timestamp and confirmation status. Do not label an unconfirmed receipt final. Retain the existing status-only verifier wrapper so unchanged invoice tests still pass.

### Proof metric definitions and incomplete reads

Define distinct recipients as all recipients of successfully discovered sender schedules, and total ever funded as their original totals, including cancelled schedules. Label these scopes in the UI. Pick the next three future end dates among non-cancelled schedules. Milestone escrows have a separate count and deadline display; do not invent end dates for them.

An unreadable schedule ID can be counted; a failed enumeration page leaves the number of undiscovered schedules unknown. Show “N known schedules unreadable” separately from “schedule discovery incomplete; additional schedules may exist.” Never claim a precise missing count or complete totals after a discovery failure. A failed contract solvency read must not show the positive coverage message.

## Phase 1 / F3: public funding proof

1. Add `proof.ts` with pure bigint aggregation and a sender-only snapshot loader. Pin ID discovery, every schedule, block timestamp, outstanding obligations and token balance to the same block. Use pages of 20, bounded RPC concurrency and cancellation on navigation.
2. Enumerate until exhaustion; deduplicate IDs and retain explicit discovery/row errors. Refresh starts a new complete snapshot rather than mixing new rows with old block data. Handle an unavailable historical block as a failed snapshot.
3. Add lazy `routes/Proof.tsx` for `/proof/:address`, including trailing slash. Validate the address before any RPC request. Render committed amount, active schedule count, recipients, total funded/claimed, future end dates, source block/time, refresh, copy/share and contract coverage.
4. Add the connected sender's “Share funding proof” entry point, mount-time title/description with cleanup, mandatory disclosures and the security link. The page must work with no wallet and no API.
5. Add unit coverage for all required accounting states, bigint precision, pagination, failed discovery and partial rows. Add browser cases for wallet-free load, invalid address/no RPC, refresh, partial data, direct load/reload and narrow screens.

Gate: totals reconcile to the same-block schedule records; cancelled refunds are excluded; the standard verification set passes.

## Phase 2 / F1: payment-request backend

1. Add typed payment-request documents, explicit public/owner response serializers, token generation/validation, exact amount/expiry validation and indexes in `db.ts`. Do not use a TTL index that deletes expired business records.
2. Implement shared settlement claims and backfill/recovery tooling from Phase 0; route existing invoice linking through it. Preserve invoice behavior and existing assertions.
3. Extend the verifier internally with optional expected sender, maximum block timestamp and verified receipt metadata. Transfer-log sender must equal `tx.from`, even when any payer is accepted. Preserve token/chain, exact calldata/log, canonical block, freshness, receipt success and confirmation checks.
4. Add authenticated create/list/cancel routes with workspace ownership and cursor pagination. Reject zero/escrow payees and invalid amounts; guard cancellation against concurrent linking.
5. Add unauthenticated GET and payment POST before session middleware. Enforce token format, identical malformed/unknown 404 responses, safe errors and strict output whitelists. Keep POST origin enforcement.
6. Rate-limit GET/POST independently per trusted client IP at the specified limits. Define proxy-header handling so callers cannot bypass limits with an arbitrary forwarded header. Align payer polling with the 10 POST/10-minute limit: use GET for ongoing status checks or pace POST retries within that budget.
7. Make linking/reverification idempotent and persist verified payer with the hash. Re-read confirmed chain state for derived status; expose unavailable honestly and never overwrite a settled identity.

Tests: ownership/authentication, exact public whitelist, all verifier boundary/error cases, rate limits, concurrent duplicate settlement across both target types, same-target retries, cancellation races, expiry/confirmation boundary, crash recovery and backfill conflicts. Use the existing temporary MongoDB fixture and deterministic RPC sources; never the user's database.

Gate: one transfer cannot settle two records, privacy is assertion-tested, and all existing direct-payment tests pass unchanged.

## Phase 3 / F1: receivables and payer frontend

1. Add `Receivables.tsx` within Workspace for create/list/cancel, status pills, public link copying and confirmed explorer receipts. Keep private metadata confined to owner responses.
2. Add lazy `/pay/:token` with the whitelisted request details, wallet setup, network switching, MUSD balance and BTC-gas checks. Reuse backend wake handling.
3. Disable payment initiation unless status is open and chain reads are fresh. Submit exactly one MUSD transfer; persist the resulting hash immediately under a token-specific pending key before API linking.
4. Resume a stored or server-linked hash after reload; retry verification with bounded backoff and a manual check after approximately five minutes. Unknown/RPC failure/pending states must not invite a second payment. Handle signature rejection and reverted transfers distinctly.
5. Render the confirmed receipt and JSON download from verified metadata. Treat the public token as a bearer link: avoid including it in analytics/error payloads and use an appropriate referrer policy for outbound explorer navigation.
6. Update all route/hosting lists and add browser coverage for owner creation, second payer, awaiting/paid transitions, reload recovery without another transfer, expiry, cancellation, backend wake and accessible mobile forms.

Gate: simulated end-to-end flow passes and pending recovery preserves a single transfer. Real two-wallet testnet payment and 12-confirmation evidence remain a separately authorized manual verification step.

## Phase 4 / F2: milestone contract and deployment preparation

1. Add separate `RunwayMilestones.sol` using the specified compiler, OpenZeppelin version, storage/interface, immutable token and no administrative controls. Leave the existing contract untouched.
2. Implement full funding with balance-delta protection, 1–20 positive amounts, pagination limits, approval bitmap, third-party recipient-only claims, cancellation refunds and outstanding-obligation accounting. Apply checks-effects-interactions and non-reentrancy to each state-changing method.
3. Enforce boundary semantics exactly: auto-release at equality; approval/cancellation prohibited then; cancelled escrows preserve approved entitlement. Auto-release makes funds claimable; it does not execute a transfer automatically.
4. Add the three proposed Foundry suites. Cover every revert path, ordering, token adversaries, rounding/overflow and deadline boundaries. Invariants should use independently tracked funded/paid/refunded balances, beyond the algebraic identity in the brief, to detect incorrect transfers or counters.
5. Extend browser deployment selection and explorer verification tooling without breaking the existing payment deployment path. Prepare standard JSON and local no-signing dry-run validation. Generate the milestone deployment manifest only from actual deployment evidence; never insert a placeholder address as a deployed record.

Gate: all existing and new contract suites pass, including fuzz/invariants; scripts validate locally without secrets or transaction submission. Prepare exact user deployment instructions and stop at the manual gate.

## Phase 5 / F2: manual deployment gate

The user runs the browser deployment flow and signs with their wallet. After receiving the deployed address and receipt, verify chain ID, code, constructor MUSD, compiler/ABI metadata, transaction and explorer verification using public reads. Record `deployments/mezo-testnet.milestones.json` without altering the payments manifest.

Do not begin Phase 6 until this gate is satisfied, as required by the scope brief.

## Phase 6 / F2: application and invoice integration

1. Add public/server milestone address configuration and typed ABI/helpers in `packages/mezo`. When absent, hide milestone features and preserve existing app behavior. When invalid or unreadable, disable milestone writes with a clear state rather than treating the deployment as ready.
2. Add the schedule/milestone selector and 1–20-row form, exact bigint total, offchain titles and optional deadline. Simulate, approve exact total and create with existing pending/recovery patterns. Recheck chain-time validity after wallet delays.
3. Add lazy `/milestones/:id` with wallet-free reads, approved/locked states, amounts, deadline and role-aware actions. Cancellation review states exactly what is refunded and what remains claimable. Explain that anyone may trigger a claim but only the recipient receives funds.
4. Include escrows in sent/received lists, committed-cash accounting, exports and JSON receipts. Pending recovery identifiers must include contract/type to avoid schedule/escrow ID collisions. Do not add escrow cash to free wallet MUSD.
5. Add milestone invoice type/linking and offchain titles. Verify at a pinned confirmed block using the existing confirmation convention, with chain/freshness/canonicality checks. Require sender, recipient, exact total and allowed reference; use shared settlement claims for uniqueness.
6. Derive funded/partially paid/paid/cancelled states from confirmed contract reads and display source block; RPC failure yields unavailable/stale, not a paid guess. Any refund takes the cancelled classification, including when approved funds have since been fully claimed.
7. Update routing/hosting and test typed helpers, accounting, invoice mismatch/duplicate/unavailable cases, feature disabled, transaction recovery and browser create/approve/claim/cancel plus auto-release behavior.

Gate: full verification passes. Separately authorized two-wallet testnet checks must show a three-milestone partial approval/claim/refund and a distinct auto-release escrow claimed after its deadline.

## Phase 7 / F3: milestone proof extension

Enumerate sender escrows and add `total - claimed - refunded` to committed MUSD, with separate schedule/escrow breakdowns. Pin both contracts and both token-balance sanity reads to the same block. Apply the same incomplete-discovery disclosure per contract, including when only one deployment can be read. Extend pure aggregation and browser tests.

Gate: combined proof reconciles to both contracts and cannot report complete totals when either source is incomplete.

## Phase 8: documentation, evidence and release preparation

Update the specific README, scope/workflow/project-plan, SECURITY, guide and assistant knowledge sections listed in the source brief; generate the guide and append a dated HANDOFF entry. Keep historical entries intact. Security documentation must cover cancellation rights, optional auto-release, MUSD privileges, public links, lack of dispute resolution and no independent audit.

Record actual commands, counts, tool versions, results and limitations in `deployments/wave2-extensions.check.json`; fill the source brief's phase notes during implementation. Distinguish simulated browser verification, public RPC inspection and actual signed testnet evidence. Never mark a manual test complete from simulated results.

Prepare release instructions for explicit later authorization: backend compatibility/backfill first, Render backend release and public API checks, milestone settings on Render/Vercel, then frontend release and production direct-load/reload checks for all three new routes. Assistant knowledge changes require the backend release too. Preserve `/api` proxy behavior and verify hosted cookies/origin/rate-limit behavior.

## Verification set

At baseline and each completed feature gate:

```text
pnpm typecheck
pnpm test
pnpm test:browser
pnpm build
pnpm format:check
```

Also run `pnpm test:contracts` whenever contracts change and at the final milestone/full-release gate, plus `git diff --check` before handoff. Use the documented alternate-port setup if Windows reserves 5173. Run focused tests while developing, then the full gate; preserve failures as failures with their causes and do not report unrun checks as passing.

## Scope control

Defer payment-link revenue in planner math and milestone event indexing. Do not add arbitration, partial milestone releases, edits after funding, automatic transfer discovery, email/PDF/tax features, team permissions or other existing Wave 2 backlog items. No date-based delivery promise is made before baseline results and the manual deployment dependency are known.
