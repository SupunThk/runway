# Mezo Runway — Wave 1 implementation steps

**Status:** Initial local implementation started October 10, 2026; release and external verification remain incomplete. See `docs/test-results.md`.  
**Related documents:** `plan.md`, `issues.md`  
**Network:** Mezo testnet only  
**Primary track:** Access and Distribution  
**Goal:** Ship a working, publicly accessible testnet app with real MUSD payment schedules, recipient claims, transaction receipts, and read-only Mezo borrowing information.

## 1. What we are building

Mezo Runway helps a small Bitcoin-holding team fund contractor payments using MUSD.

The founder will:

1. Connect a wallet.
2. See their test BTC and MUSD balances.
3. See their existing Mezo borrowing position, if one exists.
4. Create and fully fund a contractor payment schedule.
5. Share the recipient page.
6. Track accrued payments, claims, and remaining obligations.
7. Cancel a schedule under clearly displayed cancellation terms.

The contractor will:

1. Open the shared page.
2. Review the schedule and recipient address.
3. Connect a wallet.
4. Claim accrued MUSD.
5. Open the confirmed transaction in the explorer.

A separate scenario panel will show how hypothetical BTC price changes affect the founder’s existing borrowing position.

### Wave 1 boundaries

We will build:

- Wallet connection and testnet switching.
- Official testnet MUSD integration.
- A funded payment-schedule contract.
- Founder and contractor interfaces.
- Read-only borrowing-position information.
- Hypothetical BTC stress scenarios.
- Transaction history and CSV export.
- Tests, documentation, deployment, and submission materials.

We will defer:

- Borrowing and repayment inside our app.
- Automatic borrowing.
- Background payment automation.
- Fiat conversion and bank payouts.
- Cross-chain transfers.
- Yield strategies.
- Multisignature team administration.
- Production payroll processing.
- Mainnet deployment.
- Mezo Passport integration and additional wallet connectors.
- Optional MEZO balance display; MUSD remains the settlement asset.

**Important:** Payments accrue over time, but transferring accrued funds requires a claim transaction. This is not an automatic background payroll service.

## 2. Definition of a finished Wave 1

Wave 1 is complete when all of these are true:

- [x] The app is accessible through a public HTTPS URL.
- [ ] The app clearly identifies itself as a testnet prototype.
- [ ] A founder can connect a supported wallet.
- [ ] The app detects and handles the wrong network.
- [ ] It displays actual test BTC and official testnet MUSD balances.
- [ ] The founder can approve MUSD and fund a schedule.
- [ ] Funding and schedule creation occur atomically.
- [ ] A second wallet can open the recipient page.
- [x] A claim sends accrued MUSD to the stored recipient.
- [ ] Repeated claims cannot pay the same entitlement twice.
- [x] Cancellation refunds only unvested funds.
- [x] Unpaid vested funds remain claimable after cancellation.
- [x] Dashboard amounts reconcile with contract state.
- [ ] Refreshing the browser recovers schedules and receipts.
- [ ] Borrowing data is genuine, or its unavailability is explicitly disclosed.
- [ ] Scenario values are clearly separated from live values.
- [ ] Contract tests and critical browser checks pass.
- [x] Deployment addresses and example transactions are documented.
- [ ] A concise demo and submission package are ready.

A beautiful interface with simulated MUSD transfers does not satisfy this checklist.

## 3. Accounts, tools, and resources we need

### Accounts

| Requirement | Purpose |
|---|---|
| AKINDO account | Registration and submission |
| Mezo Discord access | Required participation and technical questions |
| GitHub account | Source repository and CI |
| Netlify account | Planned static frontend hosting; validate access and routing early |
| Founder test wallet | Funding schedules and inspecting a borrowing position |
| Contractor test wallet | Independent recipient flow |

Use dedicated test wallets. Do not import wallets holding valuable assets into development scripts.

### Local tools

- Git.
- A supported Node.js LTS release.
- pnpm.
- Native Foundry 1.7.1 via the official npm distribution is validated locally; WSL enumeration returned `E_ACCESSDENIED`. See `docs/buildathon.md` for the launcher and compiler settings.
- A browser with MetaMask as the initial wallet; verify Mezo testnet connection and transactions.
- An editor.
- A screen recorder.

Verify current installation instructions and compatible dependency versions before installing. Record the versions we actually use.

### Project dependencies

- React and TypeScript.
- Vite.
- viem and wagmi.
- TanStack Query.
- Tailwind CSS or another small styling setup.
- Compatible OpenZeppelin contract utilities.
- Vitest for calculations and utility functions.
- Playwright for browser verification.
- Mezo Passport deferred to Wave 2; it is not a Wave 1 dependency.

### Official references

- [Developer documentation (https://mezo.org/docs/developers/)](https://mezo.org/docs/developers/)
- [Getting started (https://mezo.org/docs/developers/getting-started/)](https://mezo.org/docs/developers/getting-started/)
- [Environment configuration (https://mezo.org/docs/developers/getting-started/configure-environment/)](https://mezo.org/docs/developers/getting-started/configure-environment/)
- [MUSD integration guide (https://mezo.org/docs/developers/musd/)](https://mezo.org/docs/developers/musd/)
- [Oracle guide (https://mezo.org/docs/developers/architecture/oracles/read-oracle/)](https://mezo.org/docs/developers/architecture/oracles/read-oracle/)
- [Passport setup (https://mezo.org/docs/developers/getting-started/configure-mezo-passport/)](https://mezo.org/docs/developers/getting-started/configure-mezo-passport/)
- [MUSD repository (https://github.com/mezo-org/musd)](https://github.com/mezo-org/musd)
- [Testnet application (https://testnet.mezo.org)](https://testnet.mezo.org)
- [Faucet (https://faucet.test.mezo.org/)](https://faucet.test.mezo.org/)
- [Testnet explorer (https://explorer.test.mezo.org/)](https://explorer.test.mezo.org/)

## 4. Phase A — confirm eligibility and freeze scope

### Step 1: Register and verify deadlines

- [ ] Register for the buildathon.
- [ ] Join the required Discord.
- [ ] Confirm the Wave 1 deadline and its timezone from the official countdown or organizer clarification. Record the source, UTC deadline, and equivalent Asia/Colombo time.
- [ ] Confirm the required submission fields.
- [ ] Confirm what preparation or implementation is allowed before the build period, ideally at the October 13 kickoff or through organizer clarification. Record whether tool checks, wallet funding, and a hosting smoke test are permitted.
- [ ] Attend or review the kickoff workshop.
- [ ] Record organizer clarifications in `docs/buildathon.md`.

The supplied brief lists October 16–26, 2026 for Wave 1. Verify the official countdown before relying on those dates.

**Completion check:** Registration, submission requirements, deadline timezone, and permitted pre-build work are documented.

### Preparation gate — target October 15

These are planned defaults and pending checks, not completed setup:

- [ ] Validate WSL availability and Foundry installation. Run a minimal compile/test using the intended EVM target, and record tool versions and commands. If WSL is unavailable, validate a supported native Windows setup and document the replacement before contract work starts.
- [ ] Confirm Netlify account access. Once organizer rules permit a scaffold/deploy test, publish a minimal Vite page and verify a direct `/schedules/<scheduleId>` URL loads and refreshes through the SPA fallback. Record the build command, output directory, and routing configuration.
- [ ] Validate MetaMask with the verified testnet configuration, two dedicated test wallets, and the funding checks in Step 3.
- [ ] Record unresolved blockers and their next action in `docs/buildathon.md`.

Do not assume preparation is permitted. Schedule any restricted code, deployment, funding, or transaction checks for October 16 after eligibility is confirmed.

### Step 2: Freeze the product decisions

Use these defaults:

| Decision | Wave 1 choice |
|---|---|
| Settlement asset | Official testnet MUSD |
| Schedule funding | Entire amount deposited upfront |
| Accrual | Linear between start and end |
| Recipient | Immutable address |
| Claim caller | Anyone |
| Claim destination | Stored recipient only |
| Cancellation | Sender only |
| Cancellation outcome | Return unvested funds; preserve vested entitlement |
| Contract administration | No fund-seizure or recipient-editing privileges |
| App fees | None |
| Borrowing integration | Read-only |
| Backend | None initially |
| Browser wallets | Rabby, MetaMask, and other detected EIP-6963 EVM providers; real-extension/testnet verification pending |
| Solidity toolchain | Native Foundry 1.7.1 npm binary validated on Windows; WSL currently inaccessible |
| Frontend hosting | Netlify, subject to the hosting smoke test |
| Passport | Deferred to Wave 2 |
| MEZO balance display | Deferred; no extra token integration required for Wave 1 |
| Protocol integration source | Call deployed contracts through verified ABIs; do not copy MUSD implementation source |

Write these decisions in `docs/product-scope.md`. Record ABI provenance and review applicable licenses for any reused artifacts or dependencies; using interfaces does not replace that review.

**Completion check:** Contract and interface behavior can be explained without unresolved payment-policy questions.

## 5. Phase B — verify the Mezo integration

### Step 3: Prepare the test wallets

- [ ] Create two dedicated test wallets for founder and contractor and test their roles in separate browser profiles.
- [ ] Record public addresses only.
- [ ] Add Mezo testnet using verified network configuration.
- [ ] Obtain test BTC.
- [ ] Give both wallets enough test BTC for their transactions.
- [ ] Obtain test MUSD through an official supported route. Verify whether the testnet borrowing app is usable and record any faucet limits, borrowing constraints, and replenishment steps.
- [ ] Keep a separate BTC gas reserve.

The contractor needs gas for a self-submitted claim. A third party may also trigger a claim, but that caller pays the transaction fee.

**Completion check:** Both wallets can submit a testnet transaction, the founder has enough MUSD for the planned smoke tests and demo, and the funding route and limits are documented.

### Step 4: Verify official contracts

For each dependency, record:

- Chain ID.
- Contract address.
- Official source.
- ABI source and version.
- Verification date.
- Whether deployed bytecode exists.
- Relevant proxy and implementation information, if applicable.

Dependencies:

- MUSD token.
- BorrowerOperations.
- TroveManager.
- Supporting contracts needed for position reads.
- Protocol price feed.
- Any additional contract required by the verified deployment.

Do not assume that an address, ABI, or method from an example matches the current testnet deployment.

Create:

```
deployments/mezo-testnet.dependencies.json
docs/integration-verification.md
```

**Completion check:** Every address used by the application is traceable to a verified source.

### Step 5: Prove the integration before building screens

Create a small read-only verification script that:

- [ ] Confirms the RPC reports the expected chain ID.
- [ ] Checks bytecode at configured contract addresses.
- [ ] Reads MUSD metadata and decimals.
- [ ] Reads both wallets’ balances.
- [ ] Reads the founder’s position status.
- [ ] Reads collateral and protocol-accounted debt where available.
- [ ] Reads the relevant price and its freshness information.
- [ ] Reports missing or unsupported data clearly.

Perform one small real testnet MUSD transfer and record its receipt.

**Completion check:** We have one confirmed MUSD transfer and one verified borrowing-position read, including an accurate “no active position” result where applicable.

**Fallback:** If position integration remains blocked after a bounded investigation, continue with payments and disclose the limitation. Do not fabricate a borrowing position.

## 6. Phase C — scaffold the repository

### Step 6: Create the workspace structure

```
apps/
  web/
contracts/
  src/
  test/
  script/
packages/
  mezo/
    src/
deployments/
docs/
  buildathon.md
  product-scope.md
  integration-verification.md
  architecture.md
  threat-model.md
  test-results.md
  demo-script.md
  submission.md
README.md
.env.example
.gitignore
pnpm-workspace.yaml
```

Responsibilities:

- `apps/web`: application and browser interactions.
- `contracts`: payment schedules, tests, and deployment scripts.
- `packages/mezo`: verified configuration, ABIs, reads, and calculations.
- `deployments`: public deployment records.
- `docs`: decisions, evidence, and submission materials.

### Step 7: Configure development

- [x] Enable strict TypeScript checking.
- [ ] Configure formatting and linting.
- [ ] Pin dependency versions and commit the lockfile.
- [x] Configure the documented compatible EVM target.
- [x] Ensure imported contract dependencies support that target.
- [x] Create a frontend environment template.
- [x] Keep signing credentials out of frontend configuration.
- [x] Ignore local secrets, build output, and temporary files.
- [ ] Add CI for type checking, tests, and production builds.

Frontend environment variables are public. They must never contain private keys.

Define this public template in the root `.env.example` (candidate network values from `plan.md`; reverify them in Steps 4–5):

```dotenv
VITE_MEZO_TESTNET_RPC=https://rpc.test.mezo.org
VITE_MEZO_TESTNET_CHAIN_ID=31611
VITE_MUSD_ADDRESS=
VITE_PAYMENT_CONTRACT_ADDRESS=
VITE_TESTNET_EXPLORER=https://explorer.test.mezo.org/
```

Fill `VITE_MUSD_ADDRESS` only from the verified dependency manifest and `VITE_PAYMENT_CONTRACT_ADDRESS` after Step 17. Validate chain ID, URLs, addresses, and deployed bytecode before enabling payment actions; blank addresses must produce a clear configuration state.

Document how `apps/web` loads the root template values during local development and how the same public values are supplied to the hosting build. Keep borrowing-contract configuration in the verified dependency manifest.

Define scripts for development, build, lint, type checking, calculation tests, browser tests, and integration verification. Document their actual commands once implemented.

**Completion check:** A fresh checkout can install dependencies and build the initial application.

## 7. Phase D — specify the payment contract

### Step 8: Define schedule state

Each schedule needs:

- Sender.
- Recipient.
- Total funded amount.
- Start timestamp.
- End timestamp.
- Total amount already claimed.
- Cancellation status.
- Vested amount frozen at cancellation.
- Optional opaque reference.

Use integer base units for all token accounting.

Schedule IDs and contract state must be retrievable without depending on browser storage.

For small Wave 1 usage, expose bounded pagination for sender and recipient schedule IDs, or implement a reliable bounded event-query strategy.

### Step 9: Define the public interface

Proposed operations:

```
createSchedule(recipient, totalAmount, start, end, referenceHash)
claim(scheduleId)
cancel(scheduleId)
claimable(scheduleId)
getSchedule(scheduleId)
```

Add view methods needed for schedule discovery.

Emit events for:

- Schedule creation.
- Successful claim.
- Cancellation and refund.

Document custom errors for invalid inputs and unauthorized operations.

### Step 10: Define accrual precisely

For an active schedule:

```
elapsed = clamp(block.timestamp - start, 0, end - start)

vested = floor(totalAmount × elapsed ÷ duration)

claimable = vested - alreadyClaimed
```

Requirements:

- Before the start, vested amount is zero.
- At or after the end, vested amount equals the full funding amount.
- At cancellation, vesting freezes.
- Subsequent claims cannot increase the frozen entitlement.
- Previously claimed funds are never refunded.
- Final settlement includes any rounding remainder.

Use safe arithmetic appropriate for multiplication and division.

### Step 11: Define cancellation precisely

When the sender cancels:

1. Compute vested entitlement.
2. Freeze that amount.
3. Mark cancellation in contract state.
4. Compute the unvested refund.
5. Transfer the refund to the sender.
6. Preserve unpaid vested funds for the recipient.
7. Emit the cancellation event.

Decide and document how cancellation after the end is handled. Prefer rejecting it as unnecessary.

Cancellation before the start returns all funding because nothing has vested.

**Completion check:** The specification covers every boundary condition before implementation begins.

## 8. Phase E — implement and test the contract

### Step 12: Implement creation and funding

- [ ] Use an immutable official MUSD address.
- [x] Validate the recipient, amount, timestamps, and duration.
- [x] Transfer funding from the sender during creation.
- [x] Revert the entire transaction if funding fails.
- [x] Record the schedule only through a successful atomic operation.
- [x] Reject unsupported token behavior if received funds differ from required funding.
- [x] Emit the created schedule ID.

No arbitrary token address or external callback should be accepted from users.

### Step 13: Implement claims and cancellation

- [x] Apply reentrancy protection.
- [x] Update accounting before token transfers.
- [x] Always send claims to the stored recipient.
- [x] Restrict cancellation to the sender.
- [x] Reject duplicate cancellation.
- [x] Handle zero claimable amounts consistently.
- [x] Avoid adding administrative withdrawal functions.

### Step 14: Write meaningful contract tests

Cover:

- Successful creation.
- Insufficient balance.
- Insufficient allowance.
- Invalid addresses and amounts.
- Invalid start/end timestamps.
- Claims before the start.
- Claims during accrual.
- Claims at and after the end.
- Multiple partial claims.
- Third-party claim callers.
- Unauthorized cancellation.
- Cancellation before the start.
- Cancellation during accrual.
- Claims after cancellation.
- Duplicate claims and cancellations.
- Multiple overlapping schedules.
- Rounding and very small amounts.
- Reentrancy attempts.

Use a mock token for controlled local tests, then verify against official testnet MUSD.

### Step 15: Add accounting invariants

For each schedule:

```
original funding
=
claimed funds
+ refunded funds
+ remaining recipient obligations
```

Globally:

```
contract MUSD balance
>=
sum of remaining obligations
```

Also verify:

- Claimed amount never exceeds vested entitlement.
- Claimed plus refunded never exceeds original funding.
- A user cannot spend another schedule’s allocation.
- Recipients cannot be changed.
- Time changes cannot recreate settled entitlement.

**Scheduling:** Implement the Step 14 unit tests and deterministic accounting assertions by October 19 before the first testnet deployment. Fuzz and stateful invariant coverage may finish on October 23 if needed; any failure must be fixed before release, with deployment repeated if contract code changes.

**Completion check:** Unit, fuzz, and invariant tests pass before the release freeze. Record the commands and results.

## 9. Phase F — deploy the contract

### Step 16: Prepare deployment

- [ ] Confirm the intended RPC and chain ID.
- [ ] Confirm the official MUSD address.
- [ ] Run all contract tests implemented so far; at minimum, the complete Step 14 unit tests and deterministic accounting assertions must pass. Track remaining fuzz and stateful invariant coverage for October 23 and require it before release.
- [ ] Review compiler and dependency settings.
- [ ] Simulate deployment.
- [ ] Check the deployment wallet’s test BTC.
- [ ] Use a local secure signing method; do not commit credentials.

### Step 17: Deploy and record evidence

Deploy to Mezo testnet.

Record:

- Contract address.
- Deployment transaction.
- Deployment block.
- Chain ID.
- MUSD address.
- Compiler configuration.
- Source commit.
- ABI or artifact reference.

Verify source in the explorer where supported. Otherwise publish reproducible source and artifacts and disclose verification status.

### Step 18: Perform a contract smoke test

Using official MUSD:

1. Approve a small amount.
2. Create a short schedule.
3. Read it directly.
4. Claim accrued funds.
5. Check the recipient balance.
6. Cancel another partially vested schedule.
7. Claim its remaining vested funds.
8. Reconcile balances.

**Completion check:** Record real explorer receipts for creation, claim, and cancellation.

## 10. Phase G — implement wallet and chain services

### Step 19: Wallet connection

Build:

- Connect and disconnect actions.
- Connected address display.
- Wrong-network notice.
- Testnet switch request.
- Rejected-signature handling.
- Account-change handling.
- Separate BTC and MUSD balance displays.

Use the detected-wallet picker for Rabby, MetaMask, and other EVM browser wallets. Discovery, selection, deduplication, rejection recovery, and disconnect are covered by simulated-provider browser tests. Record actual extension versions and verify account changes, network switching, and hosted-domain signing with real extensions. Passport remains deferred to Wave 2.

### Step 20: Shared chain services

Implement typed functions for:

- Balances.
- Allowance.
- Schedule reads.
- Schedule discovery.
- Claimable amount.
- Transaction simulation.
- Receipt confirmation.
- Borrowing-position reads.
- Price reads and freshness checks.

Use the same block for related financial reads where practical.

After account or network changes, clear incompatible cached data.

**Completion check:** Stale results from a previous wallet cannot appear as the current wallet’s balances.

## 11. Phase H — build the founder interface

### Step 21: Dashboard

Show separately:

- Wallet MUSD.
- BTC available for gas.
- Outstanding funded obligations.
- Accrued but unclaimed amounts.
- Active, cancelled, and completed schedules.
- Existing borrowing information.
- Data freshness and error states.

A completed schedule may still have unclaimed funds. Do not confuse “accrual ended” with “fully paid.”

### Step 22: Schedule creation

Fields:

- Recipient address.
- Total MUSD amount.
- Start.
- End.
- Optional local label.

Before signing, show:

- Exact recipient.
- Total amount.
- Duration.
- Display timezone.
- Accrual behavior.
- Cancellation terms.
- Required MUSD approval.
- BTC gas requirement.

Flow:

```
Validate
→ Review
→ Approve if needed
→ Confirm approval
→ Simulate creation
→ Sign creation
→ Confirm receipt
→ Open schedule page
```

Refresh balances, allowance, and timestamps immediately before creation. Use a modest future start buffer so wallet confirmation delays do not invalidate the schedule.

If approval succeeds but creation fails, explain that no schedule was funded and show how to retry.

### Step 23: Founder schedule details

Show:

- Sender and recipient.
- Original funding.
- Claimed amount.
- Current claimable amount.
- Remaining entitlement.
- Start and end.
- Cancellation status.
- Creation and settlement receipts.
- Shareable recipient link.

The cancellation confirmation must show estimated refund and preserved recipient entitlement. Explain that the final values depend on the execution timestamp.

## 12. Phase I — build the recipient interface

### Step 24: Recipient page

Use a route such as:

```
/schedules/<scheduleId>
```

Display public schedule data without requiring a login.

Include:

- Testnet label.
- Recipient address.
- Total funding.
- Accrued and unclaimed amount.
- Payment terms.
- Cancellation state.
- Claim button.
- Explorer links.

If any wallet can trigger a claim, make clear that funds still go to the stored recipient.

### Step 25: Claim experience

```
Read current entitlement
→ Check caller network and gas
→ Simulate claim
→ Request signature
→ Wait for confirmation
→ Refresh schedule and balances
→ Display receipt
```

Handle a competing claim transaction gracefully: refresh the state instead of showing an unexplained failure.

**Completion check:** The contractor can complete the workflow in a separate browser profile.

## 13. Phase J — borrowing visibility and stress scenarios

### Step 26: Read-only position panel

Use verified deployed interfaces to show:

- Position status.
- Collateral.
- Protocol-accounted debt.
- Applicable price.
- Current collateralization where reliably calculable.
- Read timestamp or block.
- External Mezo Borrow link.

Do not substitute original borrowed principal for current total debt.

Treat “no active position,” “unsupported read,” and “RPC error” as different states.

### Step 27: Hypothetical BTC scenarios

Add a slider or presets for price declines.

Calculate:

```
scenario collateral value
=
BTC collateral × hypothetical BTC price

scenario collateralization
=
scenario collateral value ÷ current accounted debt
```

Clearly state that debt and other variables are held fixed.

Do not:

- Change the displayed live price.
- Describe a scenario as a prediction.
- Promise liquidation prevention.
- Hardcode protocol thresholds from a tutorial.
- Show an exact liquidation price without validating protocol conditions.

### Step 28: Cash planning

For a simple planning tool:

```
free cash
=
max(wallet MUSD - user-designated reserve, 0)

unfunded runway in months
=
free cash ÷ monthly expenses not already funded
```

Keep committed schedule funds separate to avoid double counting.

Handle missing or zero expense rates with explanatory text.

**Completion check:** Calculation tests cover decimals, missing data, zero debt, zero expense rate, and negative free-cash inputs.

## 14. Phase K — receipts, recovery, and privacy

### Step 29: Receipts and CSV

Export:

- Chain ID.
- Contract address.
- Schedule ID.
- Transaction hash.
- Event type.
- Sender.
- Recipient.
- MUSD amount.
- Confirmed timestamp.

Use confirmed events, not pending transaction guesses.

Escape CSV fields correctly and prevent spreadsheet formula injection in user-provided labels.

### Step 30: Recovery after refresh

- [ ] Recover schedule IDs from contract reads or bounded event queries.
- [ ] Recover transaction details from confirmed receipts.
- [ ] Keep RPC pagination bounded.
- [ ] Show partial-loading and retry states.
- [ ] Ensure browser storage is only a convenience.
- [ ] Explain how a user can recover local labels if those are not synchronized.

Onchain addresses, amounts, and timing are public. A share link is not a private access mechanism.

Do not publish legal names, invoices, emails, or sensitive notes onchain. Even a hash of predictable private information can reveal information.

## 15. Phase L — end-to-end verification

### Step 31: Complete the two-wallet journey

Publish a preview using Step 34 before starting this phase; complete the final release deployment after fixes. Run on the hosted app:

1. Connect founder.
2. Check balances and network.
3. Create and fund a schedule.
4. Copy recipient link.
5. Open it in the contractor profile.
6. Claim accrued MUSD.
7. Verify recipient balance and explorer receipt.
8. Refresh both browsers.
9. Confirm consistent state.
10. Cancel a separate schedule.
11. Verify refund.
12. Claim preserved vested entitlement.

Record results in `docs/test-results.md`.

### Step 32: Verify failure handling

Test:

- Wrong network.
- Wallet disconnected.
- Rejected approval.
- Rejected creation.
- Insufficient MUSD.
- Insufficient BTC gas.
- Invalid recipient.
- Start time passing during confirmation.
- RPC timeout.
- Missing or stale oracle data.
- Duplicate claim attempts.
- Browser refresh while a transaction is pending.
- Account changes.
- Invalid schedule links.

### Step 33: Usability and release review

- [ ] Forms have labels and understandable errors.
- [ ] Keyboard navigation works.
- [ ] Financial meaning does not depend on color.
- [ ] Mobile layouts are usable.
- [ ] Addresses can be copied and verified.
- [ ] Token amounts do not silently lose precision.
- [ ] Pending and confirmed states are distinct.
- [ ] No private keys appear in source, logs, or bundles.
- [ ] The production build passes.
- [ ] Mainnet actions are disabled.
- [ ] Testnet and borrowing-risk disclosures are visible.

Testnet reduces financial exposure; it does not establish legal approval for a later production service.

## 16. Phase M — publish and prepare submission

### Step 34: Publish the frontend

- [ ] Build the frontend.
- [ ] Deploy to the validated Netlify static HTTPS setup. Use the recorded workspace build command and actual Vite output directory.
- [ ] Configure the SPA fallback so direct `/schedules/<scheduleId>` requests serve the app while static assets remain accessible.
- [ ] Configure only public environment values.
- [ ] Ensure direct schedule links survive page refresh.
- [ ] Check wallet connection on the hosted domain.
- [ ] Repeat the critical two-wallet flow.
- [ ] Record the release commit and URL.

Avoid adding a backend or hosting integration unless it solves a demonstrated requirement.

### Step 35: Finish documentation

The README must explain:

- What the app does.
- Testnet-only status.
- Prerequisites.
- Installation and local development.
- Contract testing.
- Environment configuration.
- Verified deployments.
- Founder funding.
- Contractor claiming.
- Cancellation semantics.
- Known limitations.
- Borrowing-read limitations.
- Licenses and reused code.

Publish a short threat model covering fund accounting, authorization, token assumptions, RPC errors, oracle freshness, and public blockchain data.

### Step 36: Record the demo

Prepare funded wallets and a short demonstration schedule in advance.

Three-minute flow:

1. Explain the studio’s payment problem.
2. Show actual MUSD and borrowing information.
3. Fund a schedule.
4. Switch to the contractor wallet.
5. Claim MUSD.
6. Open the explorer receipt.
7. Show committed obligations and a labeled BTC scenario.
8. Explain the Wave 2 borrowing and repayment extension.

Label accelerated schedule timing as a demonstration convenience.

Have a backup recording and transaction links in case the live network is unavailable.

### Step 37: Submit

Include:

- Project name and one-sentence description.
- Target user and problem.
- Primary track.
- Mezo testnet deployment.
- Exact MUSD integration.
- Hosted application.
- Source repository.
- Contract address and receipts.
- Demo video.
- Stack and architecture.
- Tests and known limitations.
- Team information.
- Future milestones.
- Open-source credits.

Confirm submission acceptance before the deadline. Save the submitted version, release commit, links, and screenshots.

## 17. Day-by-day execution order

| Date from supplied brief | Main outcome |
|---|---|
| October 10–15 | Confirm deadline/timezone and preparation rules; validate toolchain, wallet funding, and hosting only as permitted; record pending checks |
| October 16 | Complete deferred preparation checks; verify network, official contracts, funding, transfer, and position reads; scaffold repository and validate hosting |
| October 17 | Finalize schedule specification and implement creation |
| October 18 | Implement claims and cancellation; add boundary, authorization, and rounding unit tests |
| October 19 | Finish core unit tests and deterministic accounting assertions; deploy and smoke-test contract |
| October 20 | Implement wallet connection, balances, and founder creation flow |
| October 21 | Implement recipient page, claims, and cancellation interface |
| October 22 | Integrate read-only borrowing information and scenarios |
| October 23 | Finish fuzz and stateful invariant coverage; add receipts and refresh recovery; basic CSV if time permits; publish preview |
| October 24 | Complete hosted two-wallet verification and fix failures |
| October 25 | Freeze release, finish documentation, and record demo |
| October 26 | Submit before the verified deadline |

Aim to have the essential payment journey working by October 21.

## 18. What to cut if time runs short

Cut in this order:

1. Decorative animation.
2. Extra wallet connectors; keep Passport deferred to Wave 2.
3. Advanced charts.
4. Local schedule labels.
5. CSV polish.
6. Additional cash-planning inputs.
7. Optional backend.
8. Borrowing scenario enhancements.

Preserve:

- Official MUSD settlement.
- Correct funded-schedule accounting.
- Claims and cancellation.
- Reliable wallet and network handling.
- Refresh recovery.
- Testnet disclosures.
- Test evidence.
- Working deployment and submission materials.

If borrowing reads cannot be verified, explicitly disclose that limitation and focus the submission on the completed MUSD payment integration.

## 19. Final release gate

Before calling Wave 1 finished:

- [ ] All payment-contract tests pass.
- [ ] Accounting invariants pass.
- [ ] Type checking and production build pass.
- [ ] Real testnet funding, claim, and cancellation receipts exist.
- [ ] The hosted two-wallet journey works.
- [ ] No simulated data is presented as live data.
- [ ] All dependencies and addresses are documented.
- [ ] Known issues are written down.
- [ ] Demo and submission links work.
- [ ] The submitted release is tagged and preserved.

## 20. Issue review decisions — October 10, 2026

This review updates the checklist only. External confirmations, installations, wallet funding, and deployment checks remain pending until evidence is recorded.

| Issue | Decision and follow-up |
|---|---|
| ISSUE-01 | Keep as a preparation blocker: record the verified deadline, timezone, UTC and local equivalent in Step 1. |
| ISSUE-02 | Use WSL + Foundry as the planned default; validate it and document any fallback in the preparation gate. |
| ISSUE-03 | Select Netlify as the planned host; validate a minimal deployment and direct-link routing as early as rules allow. |
| ISSUE-04 | Select MetaMask for the initial tested wallet; verify compatibility rather than assume it. |
| ISSUE-05 | Add explicit two-wallet funding readiness, faucet limits, and replenishment evidence to Step 3. |
| ISSUE-06 | Keep organizer confirmation pending; do restricted preparation on October 16 if necessary. |
| ISSUE-07 | Defer MEZO balance display. It adds scope and verification work without improving the core MUSD payment flow. |
| ISSUE-08 | Document deployed-contract/ABI integration and no copied MUSD implementation source in Step 2; retain license review for reused artifacts. |
| ISSUE-09 | Defer Passport explicitly to Wave 2 and include additional connectors in the cut list. |
| ISSUE-10 | Define the public environment template and address-validation behavior in Step 7. |
| ISSUE-11 | Move unfinished fuzz/stateful invariant work to October 23 if needed; preserve unit/accounting checks before deployment and all tests before release. |
| ISSUE-12 | Remove unnecessary escapes from section headings. |
| ISSUE-13 | Simplify link destinations for consistency; the original angle-bracket syntax is valid Markdown. |


### Initial implementation progress — October 10, 2026

- React/Vite workspace, wallet connection, verified public network configuration, schedule creation/claim/cancellation UI and native Foundry tooling are implemented locally.
- Payment contract passes 9 local tests including 256 accounting fuzz cases; calculation helpers and disconnected browser flows each pass 4 tests.
- MUSD bytecode and ERC-20 metadata were verified at testnet block 16082936. The payment contract is now deployed and verified; see `deployments/mezo-testnet.payments.json`. Real schedule funding/claim/cancellation receipts remain pending.
- Stateful/adversarial tests, receipt history, pending-transaction recovery, complete pagination, borrowing reads/scenarios, public hosting and the funded two-wallet journey remain pending.
- Organizer approval for October 10 implementation remains unconfirmed; early work is recorded in `docs/buildathon.md`.
- Setup and test commands are in `README.md`; evidence and limitations are in `docs/test-results.md`.


### Deployment verification — October 10, 2026

Founder deployed `0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D` in transaction `0xdb151ec249a704f17390ba6b35ef5458924deff142a796995c60773c3a80f45f`. Exact local creation bytecode, constructor token, founder, receipt and deployed MUSD getter are verified. Local app configuration is updated. Explorer source verification and the real two-wallet payment journey are still pending.

### Settlement and public frontend — October 10, 2026

This update supersedes the earlier pending settlement and hosting notes. Schedule 1 is fully paid. Schedule 2 is cancelled and fully settled, including its on-chain sender refund. Both snapshots and transaction histories are recorded in `deployments/schedule-1.check.json` and `deployments/schedule-2.check.json`.

The frontend is live at https://mezo-runway-testnet.vercel.app on Vercel (the implemented host replaces the earlier Netlify plan). Completed status, cancellation refund details and consistent-block schedule reads are implemented. All 12 browser tests, four calculation tests and the production build pass. Unauthenticated production browser checks pass for the homepage, both recipient links, refresh, exact settlement figures and mobile layout. See `deployments/frontend.check.json`, `deployments/mezo-testnet.frontend.json` and `docs/frontend-hosting.md`.

Actual wallet signing on the new public origin, borrowing integration, receipt/CSV UI, pending recovery, complete pagination, adversarial/stateful tests and explorer source verification remain unfinished.
