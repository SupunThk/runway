# Wave 2 strategy: BTC treasury to contractor payments

Prepared November 1, 2026. Updated November 1 with the user's approved improvement priorities. Status: Wave 2 delivery plan; initial borrowing controls and the admin dashboard are implemented and verified locally, with remaining work below. See [the handoff](HANDOFF.md) for implementation evidence; this planning update claims no fresh checks or deployment.

## Current priorities — November 1 improvement update

The user added the following improvements to Wave 2. Prioritize completing the existing treasury workflow before expanding into more payment types. This update changes the delivery order below; older calendar allocations remain tentative.

**Existing local foundation:** founder-direct loan opening, additional borrowing, collateral additions, partial repayment, loan transaction recovery and a prefilled schedule handoff; wallet-authorized read-only admin aggregates. These are local implementations, not deployed Wave 2 behavior. The handoff is not yet a unified persistent borrowing/payment intent, and the existing planner still uses its disclosed price-only estimate. No public admin wallet is configured.

| Priority | Improvement | Planned scope and acceptance |
| --- | --- | --- |
| 1 | Guided Borrow → Fund payment flow | Persist a versioned intent with owner, chain, recipient, payment amount, reviewed terms and per-step transaction evidence. Show progress through borrowing, allowance and funding. Recover after reload, rejected prompts and interrupted steps; show “Borrowed; payment not yet funded” when appropriate, and resume funding without borrowing again. Preserve founder ownership and link confirmed receipts. Follow section 6 recovery requirements. |
| 2 | Protocol-aware runway planner | Integrate the existing quote engine into planning, including fees, minimum debt, reserve, mode/system restrictions and issuance capacity. Distinguish wallet cash, usable borrowing proceeds, debt, repayment reserve and escrow commitments. Show stale/unavailable inputs and hypothetical scenarios explicitly. Verify boundary cases and planner/quote consistency; expected revenue cannot fund current eligibility. |
| 3 | Client payment links | Create shareable MUSD payment requests, verify confirmed client transfers and expose reviewed repayment prefills. Enforce atomic settlement uniqueness across invoices and requests, public-field privacy and expiry/cancellation recovery. Follow section 7 and the extension implementation plan. |
| 4 | Public funding proof | Provide a wallet-free shareable page with funded commitments, remaining recipient entitlement and source block/time. Pin reads to one block, disclose partial results and compare contract balance with obligations. Prove displayed escrow funding without claiming overall founder solvency. Follow section 8. |
| 5 | Admin monitoring improvements | Extend existing aggregates with measured request failures, reconciliation lag and infrastructure costs where actual data is available. Define measurement windows and sources; display stale, partial or uninstrumented states explicitly. Preserve server-side authorization and customer privacy. Do not infer revenue from borrowed funds, payment volume or testnet receipts. |
| 6 | Independent user pilots | Prepare task/interview materials and capture completion, friction, assistance and return usage from independent founders and contractors. Use findings to prioritize fixes; distinguish internal tests, assisted sessions and independent completions. Retain section 10 targets as targets rather than traction claims. |

Pilot preparation and feedback collection run alongside engineering rather than waiting for priority 5. Outreach and financial transactions still require their existing authorization.

**Usability requirements across these increments:**

- Add a task checklist: connect wallet → fund wallet → create payment → share recipient link. Derive completion from observed wallet and confirmed payment state; allow returning users to resume.
- Explain transaction progress with the current step and a clear next action, including wallet confirmation, chain confirmation, failure and recovery states.
- Explain blocked actions beside the relevant control, with a specific reason and available remedy. Preserve keyboard access and readable narrow-screen layouts.
- Verify interruption/reload recovery, rejected prompts, account/network changes and the checklist on desktop and mobile. These are acceptance requirements, not a claim that onboarding or transaction polish is complete.

**Delivery order:** persistent borrowing-to-payment flow → protocol-aware planner → client payment links → public funding proof, with measured admin instrumentation and pilot-driven usability fixes alongside that work. Milestone escrow, atomic routing and billing implementation follow a working core journey and pilot feedback; pricing interviews can proceed earlier. Billing remains subject to the explicit treasury/charging decision in section 9, and new contracts retain their separate gates.

## 1. The decision

Make Runway the place where a small Bitcoin-holding studio finances work, pays contractors, collects client MUSD and manages the resulting debt.

**Pitch:** Borrow against your BTC, fund your team in MUSD, and repay from client revenue in one workspace.

The flagship journey is:

```text
Review contractor payment and funding gap
  -> Review Mezo borrowing quote and debt impact
  -> Open/increase the founder's trove through their wallet
  -> Confirm minted MUSD and fund the payment schedule
  -> Contractor claims earned MUSD
  -> Client pays a Runway payment link
  -> Founder reviews and signs an MUSD repayment
```

This is a sequence of explicit financial decisions. Borrowing is not income, a collateral top-up is not additional borrowing, and collecting revenue does not automatically repay a loan.

The evaluator's feedback identifies three deliverables: protocol writes, more accurate headroom, and a business with users beyond the developer's wallets. Treat all three as release work. The supplied buildathon brief assigns 30% each to integration and business viability; adding unrelated screens will not resolve those gaps.

## 2. Relationship to existing plans

The October 30 [scope brief](scope_update.md) and [extension implementation plan](wave2-extensions-implementation-plan.md) contain useful specifications for funding proof, payment links and milestones. Preserve them. This document proposes a different priority order in response to new feedback; it does not silently authorize executing every older backlog item.

| Existing idea | Proposed place in Wave 2 | Reason |
| --- | --- | --- |
| Borrowing, collateral top-ups and repayment | Core; build first | Direct response to integration feedback; already part of the original treasury loop |
| Recovery Mode, fees and minimum debt | Core, before protocol writes | Headroom must distinguish spendable proceeds from debt and actual eligibility |
| Client payment links, F1 | Core after borrowing flow | Supplies the revenue side of the borrow/pay/collect/repay loop |
| Public funding proof, F3 | Supporting core feature | Contractors can independently inspect funded commitments |
| Workspace pricing and user pilots | Parallel core work from day one | Direct response to business and adoption feedback |
| Milestone escrow, F2 | Gated expansion after core acceptance | Useful for project work, but requires a new contract and separate deployment/testing |
| Payroll runs and recurring templates | Follow-on, unless pilots show immediate need | Existing schedules already demonstrate contractor settlement |
| Assistant live reads/action preparation | Follow-on | Not a dependency of the financial flow; keep documented knowledge accurate |
| Passport, roles, multisig, notifications | Separate later increments | Their compatibility/authorization and operations deserve their own gates |

Ambition is a complete business workflow with evidence. Milestones remain a planned extension rather than the dependency that prevents the borrowing feature from shipping.

## 3. What exists and what must be verified

Current source supports one-time transfers, fully funded linear schedules, public schedule pages, claims/cancellation, owner-private workspace records, confirmed invoice evidence, read-only borrowing and payroll planning. The latest functional handoff describes October 23 payments; older scope/status paragraphs often predate deployed features.

Current borrowing capacity explicitly excludes fees, minimum debt and system recovery conditions. It must remain labelled an estimate until replaced by the new quote model.

The working tree at planning time contains two pre-existing untracked files: `docs/scope_update.md` and `docs/wave2-extensions-implementation-plan.md`. Preserve both. Planning HEAD is `b27b109`; this is not established as the actual Wave 1 submitted SHA. Record the submitted SHA and submission date before calculating the Wave 1-to-2 diff. The user previously deferred the `wave1` tag; leave it uncreated.

### Protocol research status

Official sources were consulted on November 1, 2026:

- [MUSD development guide](https://mezo.org/docs/developers/musd/): integration starting point and sorted-trove hint workflow.
- [MUSD developer overview](https://github.com/mezo-org/musd/blob/main/docs/README.md): system mode, composite debt and signature architecture. Its examples are not current testnet quotes.
- [BorrowerOperations source](https://github.com/mezo-org/musd/blob/main/solidity/contracts/BorrowerOperations.sol): direct operations use caller identity; source includes additional capacity checks that must be investigated.
- [Signature operations source](https://github.com/mezo-org/musd/blob/main/solidity/contracts/BorrowerOperationsSignatures.sol): delegated operations expose borrower and recipient parameters. This suggests an integration route, subject to deployment verification.
- [Official fee guide](https://mezo.org/docs/users/borrow/fees/): describes issuance cost, interest and gas deposit separately. Use live deployment parameters in quotes.
- [Official borrowing guide](https://mezo.org/docs/users/borrow/mint-musd/): onboarding reference.

These are source/documentation checks, not current-chain verification. The existing reader pins an older source revision. The pinned BorrowerOperations page could not be fetched during this review; current `main` must not be assumed to match it or the deployed proxies. Do not copy a current mainnet address or newer ABI into testnet configuration.

## 4. First engineering gate: establish the write integration

Create a read-only protocol verification report before enabling any write controls. Record chain, block number/hash/time, authoritative artifact revision, address, code identity, proxy implementation, ABI provenance and relevant bindings for BorrowerOperations and its dependencies. Verify the existing manager/feed against that same deployment.

Investigate and document:

1. Direct open, collateral addition, additional borrowing, combined adjustment and repayment entry points.
2. Fee getter, applicable exemptions/mode effects, minimum net debt, reserve and interest accounting.
3. MCR, CCR, system collateral/debt, TCR and exact operation restrictions in each mode.
4. Any per-trove issuance capacity, system cap, pause or other deployed restriction. A collateral ratio alone is insufficient if another cap applies.
5. HintHelpers/SortedTroves, hint calculations, rounding and refresh behavior.
6. Whether repayment burns from the caller or uses allowance. Do not add an approval step from habit.
7. Active versus closed/nonexistent positions, close restrictions and residual-debt requirements.
8. Supported simulation methods and RPC historical-read/fork capabilities.
9. Whether a deployed signature module is compatible with the proposed atomic path; verify typed data, nonces, deadline and recipient semantics.

Output: `deployments/mezo-testnet.borrowing-write-verification.json` containing actual evidence only. Unsupported identity or changed implementation disables protocol writes without disabling independent payment claims.

## 5. Quote and risk model

Add deterministic bigint helpers, backed by a same-block protocol snapshot. Keep a hypothetical stress estimate separate from an executable quote.

Quote inputs: owner, operation, collateral added, requested wallet MUSD, schedule amount, target collateral ratio and optional price scenario. Quote outputs include source block/time, mode, current/resulting collateral and debt, protocol fee, reserve added, interest assumptions, wallet proceeds, amount committed to the schedule, leftover MUSD, required BTC and rejection reasons.

For opening debt, model `newDebt = requestedProceeds + applicableFee + openingReserve`, subject to deployed accounting. For additional borrowing, model existing interest-inclusive debt plus requested proceeds and fee; do not add the opening reserve twice. Collateral-only top-ups mint no MUSD. Account for pending redistribution once and refresh after execution.

Compute maximum usable proceeds as the largest integer amount satisfying the deployed fee calculation, minimum debt, individual and system constraints and any issuance cap. Use bounded integer search if appropriate; do not simply subtract debt from collateral value and label the difference spendable. Validate monotonicity and operation domains before using a search.

Required behavior:

- Read mode and governing parameters; implement separate opening and adjustment rules. Do not emulate Recovery Mode by changing one threshold in the old formula.
- Evaluate projected system conditions as well as the individual position where required. Model added collateral and debt together.
- Explain ineligible minimum-size openings. Never silently enlarge a small payroll loan to the protocol minimum. Show the larger debt, surplus proceeds and require a fresh review if the user chooses that option.
- When no opening amount is eligible, return an explicit reason rather than an attractive positive capacity estimate.
- Preserve a BTC gas budget across the remaining transaction sequence; a positive BTC balance alone is insufficient.
- Display current interest and how the proposed operation affects rate/debt under verified rules. Future accrual is an assumption, not a fixed repayment promise.
- Revalidate identity, account, network, mode, oracle, fee, hints and relevant balances before each signature. Simulation is necessary but cannot lock future chain state.
- If the deployed direct call has no enforceable fee/price limit, disclose that the review is not an onchain price guarantee. Do not invent a `maxFee` argument. Investigate enforceable bounds separately if needed.
- Stale or missing required state yields unavailable, with no positive eligibility verdict. A failed quote must not be displayed as zero debt.

Testing must cover exact min-debt boundaries, fee rounding, reserve-once accounting, mode transitions, system constraints, stale price, account changes, cap-limited borrowing, insufficient BTC and debt after real execution. Recovery behavior must have deterministic fixtures even if live testnet remains in Normal Mode.

## 6. Borrow and fund: delivery architecture

### Required path: one guided workflow, recoverable wallet transactions

Keep the founder as the owner of both the Mezo trove and existing Runway schedule. No new contract is required for this first path.

1. Review a contractor payment, wallet cash, voluntary repayment reserve and funding gap. The user chooses how much cash to use and how much to borrow.
2. For an existing trove, review additional borrowing and optional collateral addition. For no trove, review a new opening and minimum-size implications.
3. Confirm the protocol transaction in the wallet. Verify its successful receipt and refresh actual trove state and wallet MUSD.
4. Present the confirmed proceeds and schedule review. Request exact schedule allowance if required, then separately simulate/sign creation with fresh chain timing.
5. Parse the confirmed schedule event, show the recipient link, and connect all transaction receipts in the workflow record.

Call this a guided multi-transaction flow. It is not atomic: borrowing can succeed while schedule funding is rejected or fails. In that case the debt remains and minted MUSD stays in the wallet. Show `Borrowed; payment not yet funded`, offer review/resume or an explicit repayment action, and never borrow again automatically.

Persist a versioned intent keyed by chain, owner and workflow ID, with reviewed terms and per-step hashes. Pending storage must distinguish BorrowerOperations, token and schedule targets. Receipt recovery validates sender, destination, calldata/value and confirmed events/state. Handle reload, replacements, account changes and concurrent tabs. A hash timeout means unknown/pending, not permission to repeat the step.

Do not claim that specific fungible token units can be traced from mint to escrow. Show a verified sequence and exact amounts; disclose wallet contribution or excess proceeds.

### Advanced gate: truly atomic borrow-to-escrow

Timebox a feasibility spike after the direct path is understood. The signature module may preserve a founder's borrower identity, but it does not solve schedule ownership by itself: existing `createSchedule` records its caller as sender. A generic router calling both contracts could own the schedule and change cancellation/refund/discovery behavior.

Require an architecture decision proving borrower identity, schedule ownership, recipient/refund destination, exact authorization, replay protection, enforceable bounds and complete rollback before proposing an atomic implementation. Never delegatecall protocol code to impersonate the wallet or mint directly to the existing payment contract without schedule accounting.

If a new adapter or payment contract is necessary, specify and test it separately; preserve existing RunwayPayments and its manifest. An atomic extension needs user-signed deployment and full security/evidence gates. If feasibility is unresolved, ship and describe the guided flow accurately; do not market it as atomic routing.

## 7. Repayment and client revenue

Add wallet-signed partial repayment from free wallet MUSD with a fresh debt quote, minimum remaining-debt checks, simulation, pending recovery and confirmed before/after debt. A voluntary repayment reserve reduces cash available for payroll; it does not lock tokens or repay automatically. Never spend escrowed recipient funds.

Full close is a separate operation with its own mode, accrued-interest, reserve and collateral-return semantics. Include only after its exact behavior and quote can be verified; do not treat an oversized partial repayment as a close. Collateral withdrawal/refinancing are later scope unless required by a verified dependency.

Implement payment links using the existing F1 specification and its implementation-plan corrections: public field whitelists, exact transfer verification, 12-block policy, canonicality/freshness checks, recovery and atomic settlement uniqueness across invoices and requests. Existing invoice behavior must remain compatible.

Resolve request expiry explicitly: proposed behavior is to stop new payment initiation at expiry while accepting later verification of a transfer mined inside the valid interval. Record this as an intentional refinement before implementation. Cancellation cannot reverse a direct transfer; payer/owner races need clear recovery and an unmatched-transfer state rather than a false claim that cancelled links prevent onchain payment.

The owner can review confirmed client receipts and open repayment with an amount prefilled for review. Incoming revenue is already reflected in wallet balance; never add it again to free cash. Expected revenue remains a separate assumption and cannot fund a current borrowing quote.

## 8. Funding proof and milestone expansion

Ship F3 with sender-only enumeration and all reads pinned to one block. Show remaining obligations, funded/claimed totals, recipients, source time, completeness and contract-level coverage. Unknown discovery length cannot be reported as a precise missing count. A funded-payroll page proves the displayed escrow commitments, not the founder's overall solvency or future business income.

Start F2 only after the borrowing-to-payment flow passes acceptance and pilot blockers are addressed. Retain the separate immutable RunwayMilestones design, approval/cancel/claim accounting, optional deadline and deployment gate from the October 30 brief. Deadline passage makes funds claimable; it does not send an automatic payout. Cancellation before that deadline can refund unapproved work, so do not imply unconditional contractor protection.

An independent model must track actual deposits, payouts and refunds; the tautological expression `claimed + refunded + (total - claimed - refunded) == total` alone cannot detect wrong transfers. Extend proof, receipts and invoice evidence only after contract/application tests pass.

## 9. Business model experiment

Recommended initial hypothesis: charge the studio a workspace subscription for organizing financed contractor work, receivables and debt-aware reporting. Contractors retain free public reads and claims. Avoid a fee proportional to borrowed amount, which would reward more debt.

**Price to test, not established demand:** 25 MUSD per workspace per 30-day service period. Test this against a disclosed alternative of a flat 1 MUSD per new schedule during interviews. Ask for the choice and reason before implementing both billing systems. No actual paying customers or willingness to pay is claimed.

For the testnet experiment, build a separate fixed-amount workspace billing request and confirmed receipt/entitlement record, labelled testnet service payment. Keep the recipient, service period, renewal terms and fee visible. No automatic recurring debit. Collecting a testnet token is not real revenue or proof of commercial demand.

Use existing verification mechanics with a distinct billing target in settlement claims; prevent the same transfer from buying two periods or settling a client invoice. Define period activation/extension, duplicate clicks, confirmation delay, reorg handling and idempotency. Treasury address and charging policy require an explicit product decision before enabling collection.

Never retrofit fees into existing schedules or deduct from contractor entitlement. Expired workspace access cannot block public claims, cancellation rights, loan repayment or access to payment evidence. For a pilot, prefer generous limits and explicit grace over blocking financial recovery. Keep the core payment primitive usable outside the subscription.

Track infrastructure cost, RPC usage and support time per active workspace. Calculate break-even workspace count from actual monthly operating cost divided by net subscription contribution; include a separate security-review budget before any mainnet business.

## 10. Real users: parallel delivery track

Start recruitment while protocol verification runs. The user handles invitations/messages unless sending is separately authorized; prepare the invitation copy, tasks and interview sheet locally.

Target persona: a 2-10-person software/design studio with BTC treasury interest and contractors willing to test MUSD. Recruit people controlling their own wallets; a new developer-generated address is not a new user.

Proposed Wave 2 targets, not current traction:

| Measure | Target | Evidence |
| --- | --- | --- |
| Discovery interviews | 5 independent people | Consented notes, current payment method, need and objections |
| Founder pilots | 3 independent founders/teams | Task completion, help required and defects |
| Independent recipient claims | 3 recipients | Consented public receipt links and verified claims |
| Complete financed payment | At least 1 external founder | Borrow receipt, owner check, schedule and recipient claim |
| Return use | 2 founders return on another day | A second meaningful payment/collection task, not just login |
| Pricing responses | At least 3 explicit choices | Accepted/rejected price and reason; distinguish intent from payment |

Use testnet assets and explain the borrowing obligation even in a pilot. Funding assistance and guided sessions must be disclosed. Never ask participants for wallet secrets. Keep consented private notes out of public chain records and publish only approved/anonymized findings.

Measure funnel stages and denominators: invited -> started -> connected -> quote reviewed -> protocol confirmed -> schedule funded -> recipient claimed -> returned. Record task duration and intervention. Separate internal demos, automated fixtures, assisted external pilots and independent completions. Report misses and blockers honestly if targets are not reached.

## 11. Engineering sequence and tentative calendar

The supplied local brief lists November 2-15 for Wave 2. Confirm the actual platform cutoff/timezone before treating these as deadlines. These are allocation targets, conditional on the first technical gate; they are not delivery promises.

| Window | Engineering outcome | Parallel product work | Exit gate |
| --- | --- | --- | --- |
| Nov 1-2 | Submitted baseline identified; isolated checks; write-contract verification | Prepare recruitment/interview material | Supported ABI/identity and quote requirements recorded |
| Nov 3-4 | Fee/mode/min-debt quote engine; add collateral; borrowing controls | First interviews; test pricing choices | Deterministic eligibility and action simulations pass |
| Nov 5-6 | Guided borrow-and-fund, persistent step recovery, partial repayment | First founder/recipient sessions | Simulated full flow and interruption cases pass |
| Nov 7-9 | Receivables/payment links, repayment prefills, schedule-only proof | External financed-payment pilot | Cross-record settlement uniqueness and public privacy pass |
| Nov 10-11 | Workspace billing pilot; fix observed usability failures | Return visits and pricing follow-up | Actual user evidence captured; core release candidate stable |
| Nov 12 | Optional milestone/atomic gate decision | Review adoption results | Expand only with core gates green and review capacity |
| Nov 13-14 | Freeze, full verification, coordinated release preparation, demo | Verify claims and prepare evidence | Exact-source tests and truthful release/submission notes |
| Nov 15 | Submission buffer before verified cutoff | Submit measured progress | Working links and recorded Wave 1-to-2 changes |

Milestones or atomic routing may extend beyond this window. If the core slips, preserve quote correctness, borrower ownership, safe recovery, repayment and user evidence; defer new contracts and ancillary features first.

Suggested implementation units:

- `packages/mezo`: verified write ABI/config, system snapshots, quote helpers, hints, typed simulation builders.
- `apps/web/src`: borrowing action panels, reviewed funding intent, multi-step recovery and repayment; reuse existing wallet selection and query patterns.
- `apps/api/src`: payment requests, shared settlement claims/backfill, billing entitlement and authorized serializers. Extract new domains into modules rather than growing the central route file indefinitely.
- `tests` and package/API tests: deterministic mode/fee/cap cases, actual isolated API/database flows and wallet recovery cases.
- `deployments`: new read-only verification and release evidence, without invented addresses or passing counts.

## 12. Verification and release acceptance

Establish a fresh isolated baseline before application edits: typecheck, unit/API tests, browser tests, build, format check and existing contract tests. Do not treat historical counts as today's baseline. Use explicit test configuration and alternate available ports; never read or load the user's `.env` during unattended checks. Inspect command entry points before running scripts that might implicitly load it.

Add targeted pure-math and integration cases while building, then run the full release gate. For protocol behavior prefer tests against verified deployed bytecode in a supported isolated fork, with controllable price/system fixtures for mode cases. Record when fork access is unavailable and distinguish test doubles from actual deployment execution.

Real signed testnet acceptance, performed by users after the reviewed flow is ready:

1. Open or increase a founder-owned trove in Runway, verify actual collateral/debt/proceeds and receipt.
2. Add collateral and confirm debt does not increase from that operation alone.
3. Fund an existing-contract schedule and verify the founder remains its sender; recipient claims actual MUSD.
4. Interrupt after borrowing, reload, and resume funding without another borrowing transaction.
5. Receive a client payment through a link, wait for the confirmation policy, and repay a reviewed amount; verify debt reduction and residual minimum.
6. Confirm pricing/entitlement test behavior separately; never count that testnet receipt as commercial revenue.

Do not submit transactions autonomously or repeat old completed Wave 1 payments to reconstruct context. No contract deployment is necessary for the direct guided path. New milestone/atomic contracts require their specified user-signed deployment gate.

Release API compatibility and settlement backfill first, then the Render deployment branch, followed by frontend release on main. A main push currently triggers Vercel without waiting for CI. Public routes, origin/cookies, index freshness, account isolation, provider errors and direct-load/reload behavior must pass on the actual hosted path. Keep current payment indexing and unrelated server settings intact.

Update the guide source and generated user guide, borrowing docs, SECURITY, architecture, reviewed assistant knowledge, README and dated handoff when features actually ship. The assistant knowledge update requires a backend release. Publish exact-SHA evidence and an explicit Wave 1-to-2 changelog, separating source checks, simulations, real signed transactions and independent users.

## 13. Immediate next work

The initial write-integration gate, deterministic quotes, borrowing controls and admin dashboard are recorded as completed locally in the handoff. Establish a fresh isolated baseline before further application edits, then implement the persistent borrowing-to-payment intent and integrate protocol-aware planning in the priority order above. Prepare the pilot invitation, task sheet and pricing interview alongside engineering. Configure local admin access only after the user supplies their designated public wallet address.

This planning document does not authorize commits, pushes, tags, deployments, paid services, outreach or transactions. Preserve existing documents, historical evidence, ignored tooling, deployed payment rules and secret configuration.
