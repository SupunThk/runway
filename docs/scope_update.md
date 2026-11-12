# Scope update — Wave 2 extensions (October 30, 2026)

This document adds three features to the project **beyond** the existing Wave 2 backlog in [development-workflow.md](development-workflow.md) and [project-plan.md](project-plan.md#5-expanded-wave-1-and-wave-2). It is written as an execution brief for a coding agent (Codex). Execute phases in order; each phase ends with a verification gate.

| ID | Feature | Summary | Contract change |
| --- | --- | --- | --- |
| F1 | **Client payment links** | Studios create a shareable `/pay/<token>` link so *their clients* pay invoices in MUSD. Closes the "business revenue" step of the core loop. | None |
| F2 | **Milestone escrow** | Fully funded escrow released per approved milestone, with optional contractor-protecting auto-release. | **New contract** `RunwayMilestones` (existing `RunwayPayments` untouched) |
| F3 | **Public funded-payroll proof page** | Shareable `/proof/<address>` page showing, from chain state only, how much MUSD a sender has committed to recipients. | None |

Execution order: **Phase 0 → F3 → F1 → F2 (contract) → F2 (app) → F3 extension → Docs/release.** F3 first because it is lowest-risk and read-only; F2 contract work needs a user-signed deployment before its app phase can be verified against testnet.

---

## 0. Ground rules for the executing agent

1. **Never read, print, modify or commit `.env`.** Use `.env.example` for new public settings. Never put secrets in `VITE_*` variables.
2. **Do not modify `contracts/src/RunwayPayments.sol`** or its deployment manifest. It is deployed, verified and immutable.
3. **Do not commit, push, tag, deploy, or submit transactions** unless the user explicitly asks. Do not create the `wave1` git tag. Testnet contract deployment is a **manual user step** (wallet signing via `pnpm deploy:browser`).
4. Do not delete or weaken existing test assertions. Add tests; do not rewrite unrelated ones.
5. Preserve existing comments/docstrings, `HANDOFF.md` history, `deployments/*.check.json` evidence and ignored `.tools/` files.
6. Match existing conventions: Hono routes in `apps/api/src/app.ts`, `zod`/manual validation style already used there, MongoDB via `c.get('db')`, exact MUSD base units as decimal strings, viem for chain access, lazy routes in `apps/web/src/Router.tsx`, Vanilla CSS in `style.css` / `refinements.css`.
7. Package manager: `pnpm@10.34.6` (or `npm exec --yes --package=pnpm@10.34.6 -- pnpm ...`). Node 24.
8. **Verification command set (VERIFY):**
   ```text
   pnpm typecheck
   pnpm test
   pnpm test:browser
   pnpm build
   pnpm format:check
   pnpm test:contracts   # required whenever contracts/ changes
   ```
   If port 5173 is reserved on Windows, use the alternate-port approach from the README.

### Phase 0 — baseline

- Run `git status` and record pre-existing local changes; do not revert them.
- Run VERIFY once and record the green baseline (test counts) in the phase notes at the bottom of this file.

---

## F3. Public funded-payroll proof page

### Goal

A wallet-free, shareable page at `/proof/<senderAddress>` that proves — from chain state only — how much MUSD a sender has locked for recipients. Contractors and clients can check that payroll is actually funded before accepting work.

### Behaviour

- Route: `/proof/:address` (also accept trailing slash). Invalid address → friendly error state, no RPC calls.
- Data source: **direct RPC reads** of `RunwayPayments` (no backend required), reusing the existing chain client/config in `apps/web/src/config.ts` and schedule reading helpers in `apps/web/src/schedules.ts` / `hooks/useSchedules.ts`.
- Discover all sender schedule IDs via `getSenderScheduleIds(sender, offset, limit)` in pages (limit ≤ 100; existing UI uses 20). Read each schedule via `getSchedule(id)` at a **single pinned block number** so totals are consistent.
- Per schedule, compute remaining funded obligation:
  ```text
  entitlementCap = cancelled ? vestedAtCancellation : total
  remaining      = entitlementCap - claimed
  ```
- Display:
  - **Committed MUSD** (sum of `remaining`), **active schedules** count (not cancelled and `end > blockTimestamp`), **distinct recipients** count, **total ever funded**, **total claimed by recipients**.
  - Next 3 schedule end dates (dates only; link each to existing `/schedules/<id>`).
  - Source block number + block timestamp + "Refresh" button.
  - Contract-level sanity line: `RunwayPayments.outstandingObligations()` vs `MUSD.balanceOf(RunwayPayments)` at the same block. Show "Contract balance covers all outstanding obligations" only when `balance >= outstanding`; otherwise show a warning.
- **Copy/share** button for the page URL. Optional: "Show proof link" button on the Overview page for the connected wallet.
- Partial failures: if some pages/schedules fail, show partial totals with an explicit "Partial — N schedules could not be read" banner; never present a partial sum as complete (mirror existing Overview disclosure behaviour).

### Mandatory disclosures (on page)

- Data is public chain state; no names or invoice details are shown.
- "Funded" means MUSD is escrowed in the payment contract; it does not describe the sender's other assets, debts or solvency.
- MUSD has privileged roles that can affect balances — link to `SECURITY.md#trust-assumptions`.
- Testnet prototype; no independent audit.

### Implementation checklist

- [ ] `apps/web/src/routes/Proof.tsx` (new, lazy-loaded) + pure aggregation helper `apps/web/src/proof.ts` with unit tests (`proof.test.ts`) covering: active, completed, cancelled-with-unclaimed, fully claimed, empty sender, partial failure.
- [ ] `apps/web/src/Router.tsx`: add `/proof/:address` to the client-side link regex and render switch.
- [ ] `vercel.json`: add rewrites for `/proof/:address` → `/index.html` (check `netlify.toml` and `scripts/prepare-frontend-deploy.mjs` / `scripts/verify-frontend.mjs` for route lists that also need updating).
- [ ] Sidebar/Overview entry point ("Share funding proof") for the connected sender.
- [ ] SEO: page `<title>` and meta description set on mount.
- [ ] Playwright spec `tests/proof.spec.ts` using the existing simulated-provider fixtures: renders totals, invalid address state, partial-failure banner, direct-load + reload of `/proof/<addr>`.

### Acceptance criteria

- Loading `/proof/<sender>` without a wallet shows totals matching the sum of individual `/schedules/<id>` pages at the same block.
- Cancelled schedules count only unclaimed vested funds; refunds are excluded.
- Reload and direct navigation work locally and via Vercel rewrites.
- VERIFY passes.

---

## F1. Client payment links (receivables)

### Goal

A workspace owner creates a **payment request** for one of *their* clients. The client opens a public link, connects any EVM wallet on Mezo testnet, and pays the exact MUSD amount by direct transfer. Runway verifies the transfer onchain and marks the request paid. No contract change.

### Data model — new MongoDB collection `paymentRequests`

```ts
type PaymentRequest = {
  _id: string;                 // randomUUID()
  workspaceId: string;
  owner: string;               // lowercase session address that created it
  token: string;               // 32 random bytes, base64url; the public URL secret
  payee: string;               // lowercase receiving address (default: owner)
  amount: string;              // display string as entered
  amountBaseUnits: string;     // exact MUSD base units (reuse invoiceAmount())
  publicMemo: string;          // shown to the payer, ≤ 280 chars
  privateNote?: string;        // owner-only, ≤ 500 chars, never returned publicly
  clientLabel?: string;        // owner-only, ≤ 120 chars
  expiresAt: string;           // ISO; default createdAt + 30 days; max 180 days
  status: 'open' | 'cancelled';  // persisted; paid/expired are derived
  transactionHash?: string;    // lowercase, set once
  payer?: string;              // lowercase tx.from, set with hash
  paymentKey?: string;         // `${chainId}:${token}:${hash}` — unique sparse
  createdAt: string;
};
```

Indexes (add to `apps/api/src/db.ts`):
- `{ token: 1 }` unique
- `{ workspaceId: 1, _id: 1 }`
- `{ paymentKey: 1 }` unique, sparse — **share the uniqueness namespace with invoices**: before linking, also check that no invoice has the same `paymentKey` (and vice versa in the invoice route) so one transfer cannot settle both an invoice and a request.

Derived status returned by the API: `open | awaiting_confirmation | paid | expired | cancelled | unavailable`.

### Verifier change

Generalise `apps/api/src/direct-payments.ts`:
- Add an optional `expectedSender` (current invoice path passes the owner; payment requests pass `undefined` → any sender accepted).
- Add an optional `notAfter` (request `expiresAt`): transfer block timestamp must be ≥ `createdAt` and ≤ `expiresAt`.
- Keep the existing 12-confirmation rule, chain-ID check, tip-freshness check, exact `transfer(payee, amount)` decoding and `Transfer` log match.
- Return the transaction `from` so it can be stored as `payer`.
- Existing `direct-payments.test.ts` must keep passing unchanged; add cases for any-sender, expiry boundary, wrong payee, wrong amount, reverted tx, pending receipt.

### API routes

Owner routes (behind existing session + workspace middleware, under `/api/workspaces/:workspaceId/...`):

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/payment-requests` | Create. Validate payee address (checksum-insensitive, not zero, not the RunwayPayments/RunwayMilestones contract), amount, memo, expiry. |
| `GET` | `/payment-requests` | Cursor-paginated list (reuse `page()` helper) with derived status; includes private fields. |
| `POST` | `/payment-requests/:requestId/cancel` | Only if not yet linked to a transaction. |

Public routes (**register before the session middleware at `app.ts` ~L423**, so they need no login; keep origin checks for POST):

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/pay/:token` | Returns only: payee, amount, amountBaseUnits, publicMemo, workspace display name, expiresAt, derived status, transactionHash (if any), chainId, token contract address. **Never** returns privateNote, clientLabel, owner session data or workspaceId. |
| `POST` | `/api/pay/:token/payment` | Body `{ transactionHash }`. Verify via generalised verifier; on success set `transactionHash`, `payer`, `paymentKey` atomically (`$exists: false` guard like the invoice route). Map statuses to 409/503 with the same safe messages style as the invoice route ("do not send another payment"). |

Hardening:
- Token: 32 random bytes, base64url; validate format before DB lookup; respond 404 for unknown/malformed tokens identically.
- Rate-limit both public routes per IP using the existing `rateLimits` collection mechanism (e.g. 60 GET / 10 POST per 10 minutes).
- Reject payment linking for `cancelled` or `expired` requests (but still return status for already-paid ones).
- Never expose driver errors (existing `onError` handler already does this).

### Frontend

- **Workspace → "Receivables" tab** (`apps/web/src/Workspace.tsx` or a new `Receivables.tsx` component): create form (payee defaults to connected wallet, amount, public memo, private note, client label, expiry), list with status pills, "Copy link", "Cancel", and explorer link when paid.
- **Public payer page** `apps/web/src/routes/Pay.tsx` at `/pay/:token` (lazy):
  - Shows workspace name, memo, exact amount, payee address (with copy), expiry and status.
  - Wallet connect via existing `WalletConnection` / `WalletSetup` flows (network switch, MUSD import).
  - Pre-flight checks: correct chain, MUSD balance ≥ amount, BTC gas > 0.
  - Single `MUSD.transfer(payee, amountBaseUnits)` call; then automatically `POST /api/pay/:token/payment` with the hash.
  - Store the pending hash in localStorage keyed by token (reuse `pending.ts` patterns) so a refresh resumes verification instead of prompting a second payment. Show "Payment sent — waiting for 12 confirmations" with retry polling (backoff, max ~5 min, then manual "Check again").
  - If backend is asleep, reuse `BackendWakeNotice` / `useBackendWake`.
  - Paid state shows receipt (hash, block, payer, amount) and "Download receipt (JSON)".
- `Router.tsx` + `vercel.json` (and other route lists) for `/pay/:token`.
- Optional (stretch): in `RunwayPlanner`, display "MUSD received via payment links (last 30 days)" as informational only — **do not** feed it into runway math without an explicit assumption toggle.

### Disclosures

- Payer page: "Payments are public onchain transfers on Mezo testnet. Runway never holds these funds; MUSD goes directly to the payee address."
- Owner page: payment requests are business records (owner-private), but the resulting transfer is public.

### Tests

- API (`apps/api/src/payment-requests.test.ts`, using the existing temporary MongoDB fixture in `apps/api/test-fixture.ts`): create/list/cancel auth & ownership, public GET field whitelist (assert private fields absent), link success, duplicate hash across two requests (409), hash already used by an invoice (409), expired/cancelled rejection, malformed token 404, rate limit.
- Browser (`tests/pay.spec.ts`): owner creates a link; payer page renders; simulated transfer → awaiting confirmation → paid; reload during pending resumes without a second transfer prompt; expired link state.

### Acceptance criteria

- A second wallet can pay a link end-to-end on testnet; the owner sees `paid` with the correct payer and hash after 12 confirmations.
- One transaction hash can settle at most one request or invoice.
- Public responses never include private fields (enforced by test).
- VERIFY passes.

---

## F2. Milestone escrow — contract `RunwayMilestones`

### Goal

Many contractors are paid per deliverable, not per second. Add a **separate, non-upgradeable** contract that holds full MUSD funding for a list of milestones and releases each one on sender approval, with an optional **auto-release deadline** that protects the contractor from a sender who stops responding.

### Design principles (match `RunwayPayments`)

- Solidity `0.8.28`, OpenZeppelin `5.0.2` (`SafeERC20`, `ReentrancyGuard`, `Math`), London EVM target (`contracts/foundry.toml`).
- Immutable MUSD address set in constructor (non-zero, has code).
- No owner/admin, no upgrade, no fees, no arbitrary token, no arbitrary external calls, no recipient edits.
- Full funding at creation; fee-on-transfer/rebasing defence via balance delta check (`UnsupportedToken`).
- Pull-based claims: **anyone** may call `claim`, funds always go to the stored recipient.
- Checks-effects-interactions + `nonReentrant` on every state-changing function.

### Storage and interface

```solidity
struct Escrow {
    address sender;
    address recipient;
    uint64  createdAt;
    uint64  autoReleaseAt;   // 0 = disabled; else all un-cancelled milestones become claimable at/after this time
    uint8   milestoneCount;  // 1..20
    bool    cancelled;
    uint256 total;           // sum of milestone amounts
    uint256 approvedAmount;  // sum of approved milestone amounts
    uint256 claimed;
    uint256 refunded;
    bytes32 referenceHash;   // opaque invoice reference, same semantics as RunwayPayments
}

uint256 public escrowCount;
uint256 public outstandingObligations;           // sum over escrows of (total - claimed - refunded)
mapping(uint256 => Escrow) private escrows;
mapping(uint256 => uint256[]) private milestoneAmounts;
mapping(uint256 => uint256) private approvedBitmap; // bit i set = milestone i approved
mapping(address => uint256[]) private senderIds;
mapping(address => uint256[]) private recipientIds;

function createEscrow(address recipient, uint256[] calldata amounts, uint64 autoReleaseAt, bytes32 referenceHash) external returns (uint256 id);
function approveMilestone(uint256 id, uint8 index) external;     // sender only
function claim(uint256 id) external;                             // anyone; pays recipient
function cancel(uint256 id) external;                            // sender only; refunds unapproved
function claimable(uint256 id) external view returns (uint256);
function getEscrow(uint256 id) external view returns (Escrow memory);
function getMilestones(uint256 id) external view returns (uint256[] memory amounts, bool[] memory approved);
function getSenderEscrowIds(address sender, uint256 offset, uint256 limit) external view returns (uint256[] memory);   // limit ≤ 100
function getRecipientEscrowIds(address recipient, uint256 offset, uint256 limit) external view returns (uint256[] memory);
```

Events:

```solidity
event EscrowCreated(uint256 indexed escrowId, address indexed sender, address indexed recipient, uint256 total, uint8 milestoneCount, uint64 autoReleaseAt, bytes32 referenceHash);
event MilestoneApproved(uint256 indexed escrowId, uint8 indexed index, uint256 amount);
event Claimed(uint256 indexed escrowId, address indexed recipient, uint256 amount);
event Cancelled(uint256 indexed escrowId, address indexed sender, uint256 refund);
```

Errors: `InvalidInput`, `UnknownEscrow`, `Unauthorized`, `AlreadyCancelled`, `AlreadyApproved`, `AutoReleased`, `NothingToClaim`, `NothingToRefund`, `UnsupportedToken`.

### Rules

- **Create:** `recipient != 0`, `recipient != address(this)`, `recipient != msg.sender`; `1 ≤ amounts.length ≤ 20`; every amount `> 0`; `autoReleaseAt == 0 || autoReleaseAt > block.timestamp`. Transfer `sum(amounts)` in via `safeTransferFrom` with balance-delta check. `outstandingObligations += total`.
- **Releasable amount:**
  ```text
  if cancelled:                                   releasable = approvedAmount
  else if autoReleaseAt != 0 && now >= autoReleaseAt: releasable = total
  else:                                           releasable = approvedAmount
  claimable = releasable - claimed
  ```
- **Approve:** sender only; not cancelled; index < milestoneCount; not already approved; revert `AutoReleased` if auto-release time has passed (everything is already releasable). Sets bit, `approvedAmount += amount`.
- **Claim:** `claimable > 0` else `NothingToClaim`; `claimed += amount`; `outstandingObligations -= amount`; transfer to recipient.
- **Cancel:** sender only; not cancelled; revert `AutoReleased` if `autoReleaseAt != 0 && now >= autoReleaseAt`; `refund = total - approvedAmount`; revert `NothingToRefund` if 0. Set `cancelled`, `refunded = refund`, `outstandingObligations -= refund`, transfer refund to sender. Approved-but-unclaimed funds remain claimable.

### Trust model (document in `SECURITY.md`)

- Without auto-release, the sender can cancel unapproved milestones at any time; the contractor relies on approvals. With auto-release, the sender's cancel right ends at `autoReleaseAt`, after which the contractor can claim everything not refunded.
- There is no dispute resolution or arbitration onchain. UI must state this plainly.

### Foundry tests (`contracts/test/RunwayMilestones.t.sol`, `RunwayMilestonesSecurity.t.sol`, `RunwayMilestonesInvariant.t.sol`)

Mirror the existing suites:
- Input validation (each revert path), 1 and 20 milestones, 21 rejected, zero amount rejected.
- Approve → claim; partial approvals; double-approve; non-sender approve/cancel; approve after cancel.
- Cancel with none/some/all approved; claim after cancel pays approved remainder only; double cancel.
- Auto-release: claim all at boundary (`== autoReleaseAt`), cancel/approve revert after boundary, cancel allowed just before.
- Third-party `claim` always pays recipient.
- Fee-on-transfer token → `UnsupportedToken`; reentrant token attempt blocked (reuse existing adversarial mocks).
- Pagination limits.
- **Invariants:** per escrow `claimed + refunded + (total - claimed - refunded) == total` and `claimed ≤ releasable`; global `outstandingObligations == Σ(total - claimed - refunded)`; `MUSD.balanceOf(contract) ≥ outstandingObligations`; `refunded > 0 ⇒ cancelled`.
- Fuzz amounts, milestone counts, approval order, time warps and cancel timing.

### Deployment (manual user step)

- Extend `scripts/deploy-browser.mjs` / `scripts/deploy/main.js` to support selecting `RunwayMilestones` (keep `RunwayPayments` path working). Constructor arg: existing MUSD `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`.
- Write `deployments/mezo-testnet.milestones.json` (address, chainId 31611, tx hash, block, compiler settings, ABI hash) using the same shape as `mezo-testnet.payments.json`.
- Generate standard-JSON input at `deployments/verification/RunwayMilestones.standard-input.json` and extend `scripts/verify-explorer.mjs` for exact-match explorer verification.
- **The agent prepares scripts and stops.** The user runs `pnpm deploy:browser` and signs with their wallet, then provides the deployed address.

### Acceptance criteria (contract phase)

- `pnpm test:contracts` passes with all new and existing suites; existing 24 tests unchanged.
- Deployment scripts build and dry-run locally without a key; no private key is ever exported or stored.

---

## F2. Milestone escrow — application integration

Start only after the user supplies the deployed `RunwayMilestones` address.

### Configuration

- Add `VITE_RUNWAY_MILESTONES_ADDRESS` (public) and server-side `RUNWAY_MILESTONES_ADDRESS` to `.env.example` and config loaders. When unset, all milestone UI is hidden and the rest of the app works unchanged (feature flag by presence).
- Add ABI to `packages/mezo` (or a new `packages/payments` if the reusable helper package from Wave 1 exists by then) with typed read/write helpers: `createEscrow`, `approveMilestone`, `claimMilestones`, `cancelEscrow`, `readEscrow`, `readMilestones`, `listSenderEscrows`, `listRecipientEscrows`.

### Frontend

- **Create:** in `routes/NewSchedule.tsx` add a payment-type selector: *Time-based schedule* (existing) / *Milestones*. Milestone form: recipient, 1–20 rows (title stored offchain only, amount), optional auto-release date/time, live total. Approve exact total → `createEscrow`. Use the same two-step approve/create UX, pending recovery (`pending.ts`) and chain-time buffer rules as schedules.
- **Detail page** `/milestones/:id` (lazy, wallet-free read like `/schedules/:id`): milestone list with approved/locked state, releasable/claimable/refunded totals, auto-release countdown, actions: *Approve* (sender), *Claim* (anyone, pays recipient), *Cancel remaining* (sender, with a confirmation dialog stating exactly what is refunded and what stays claimable).
- **Overview / ScheduleList:** show sent and received escrows alongside schedules with a type badge; include escrows in CSV export and JSON receipts (`history.ts`, `TransactionHistory.tsx`).
- **TreasuryLedger / planner:** treat escrow `total - claimed - refunded` as committed MUSD (same category as schedule escrow).
- Milestone titles are offchain: keep them in the workspace invoice when created from an invoice; otherwise local-only. Never put titles onchain.
- Router + `vercel.json` rewrites for `/milestones/:id`.

### Backend / reconciliation

- Invoice `paymentType` gains `'milestone'`. Linking route accepts `{ escrowId }` for milestone invoices.
- Verification approach (keep scope contained): **direct RPC verification**, not a new indexer generation. Read `getEscrow(id)` at `head - 12` confirmed block; require `sender == session address`, `recipient == invoice.recipient`, `total == invoice.amountBaseUnits`, and `referenceHash ∈ {0x0, invoice.paymentReference}`. Store `escrowId` and `paymentKey = ${chainId}:${milestonesAddress}:${escrowId}` (unique, shared namespace as above).
- Invoice status derivation for milestone invoices: `funded`, `partially_paid` (claimed > 0), `paid` (claimed == total - refunded and refunded == 0), `cancelled` (refunded > 0; show amounts), computed from a fresh confirmed read with source block disclosed. Mark stale/unavailable when RPC fails.
- Stretch (only if time allows): add `RunwayMilestones` events to `index-payments.ts` as a separate index key with its own checkpoint/reorg handling.

### Tests

- Unit tests for typed helpers and status derivation.
- API tests for milestone invoice linking (mismatch cases, duplicate link, unavailable RPC).
- Playwright `tests/milestones.spec.ts` with simulated provider: create → approve one → claim → cancel remaining; auto-release display; feature hidden when address unset.

### Acceptance criteria

- With two testnet wallets: sender funds a 3-milestone escrow, approves one, recipient claims it, sender cancels the rest; balances, receipts and invoice status reconcile with chain state.
- With auto-release: after the deadline, the recipient claims the full remaining amount without approvals.
- App behaves exactly as before when the milestones address is not configured.
- VERIFY passes (including contracts).

---

## F3 extension — include milestone escrows in the proof page

After F2 app integration:
- `/proof/<address>` also enumerates `getSenderEscrowIds` and adds `total - claimed - refunded` per escrow to **Committed MUSD**, with a breakdown row "Time-based schedules" vs "Milestone escrows".
- Add the second contract's `outstandingObligations()` vs balance sanity check.
- Update `proof.test.ts` and `tests/proof.spec.ts`.

---

## Documentation and release phase

Update (do not rewrite unrelated sections):
- [ ] `README.md`: feature table rows for payment links, milestone escrow, funding proof; deployments table row for `RunwayMilestones` (once deployed); limits.
- [ ] `docs/product-scope.md` and `docs/development-workflow.md`: add a dated "Scope revision — October 30, 2026" entry referencing this file.
- [ ] `docs/project-plan.md` §5: add these three items to Wave 2 as extensions.
- [ ] `SECURITY.md`: `RunwayMilestones` trust model, threat model rows (sender non-approval, auto-release, griefing via many tiny escrows, public token links), and the payment-link token secrecy model.
- [ ] `apps/web/src/guide.ts`: user-guide sections for all three features, then `pnpm docs:generate`.
- [ ] `apps/api/src/assistant-knowledge.ts` / `docs/assistant-knowledge.md`: reviewed public descriptions (backend release required; flag to user).
- [ ] `docs/HANDOFF.md`: append a new dated entry (do not edit history).
- [ ] New evidence file `deployments/wave2-extensions.check.json` with VERIFY results and test counts.

Release notes for the user (agent does not execute):
1. Backend changes (payment requests, verifier, milestone linking) deploy via the Render branch `deploy/render-backend-2026-10-13` **before** the frontend.
2. Set `RUNWAY_MILESTONES_ADDRESS` on Render and `VITE_RUNWAY_MILESTONES_ADDRESS` on Vercel.
3. Frontend deploys via push to `main` (Vercel). Verify `/pay/*`, `/proof/*`, `/milestones/*` direct loads and reloads in production.

---

## Out of scope for this update

- Changes to `RunwayPayments` or its deployment.
- Onchain dispute resolution/arbitration, partial milestone amounts, milestone edits after funding.
- Automatic detection of payment-link transfers without a submitted hash (possible later via Transfer log scanning).
- Fiat pricing, invoicing PDFs, tax features, email delivery of links.
- Anything already listed in the Wave 2 backlog (payroll runs, recurring plans, contractor submissions, approvals, forecasting, team roles/multisig, notifications/reporting) and the exclusions in `project-plan.md` §5.

## Decisions taken in this brief (user may override before execution)

| Decision | Choice | Alternative |
| --- | --- | --- |
| Milestone release model | Sender approval + optional auto-release deadline | Approval only (weaker contractor protection) |
| Milestone limit | 20 per escrow | Higher limits increase gas and UI complexity |
| Milestone invoice verification | Direct confirmed RPC read | Full indexer integration (stretch) |
| Payment-link settlement | Direct MUSD transfer + submitted hash, 12 confirmations | Escrowed checkout contract |
| Payment-link payer identity | Any sender accepted; payer recorded | Restrict to a pre-declared client wallet |
| Proof page data source | Frontend RPC only, no backend | Backend-cached summary |

## Phase notes (executing agent fills in)

| Phase | Date | Result | Test counts / notes |
| --- | --- | --- | --- |
| 0 Baseline | | | |
| F3 Proof page | | | |
| F1 Payment links | | | |
| F2 Contract | | | |
| F2 Deployment (user) | | | |
| F2 App integration | | | |
| F3 Extension | | | |
| Docs | | | |
