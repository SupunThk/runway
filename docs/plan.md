# Codex execution plan: Runway Wave 1 polish

> **Audience:** Codex (autonomous coding agent) working in `c:\Projects\MEZO` on Windows/PowerShell.
> **Goal:** Ship these polish tasks without breaking any existing behaviour:
> - Runway planner
> - MEZO balance
> - Cold-start UX and keep-alive
> - `App.tsx` split
> - Lazy routes and chunking
> - `SECURITY.md`
> - Commits and the `wave1` tag
>
> Work **phase by phase, in order**. Each phase ends with verification and a **local** commit.

---

## 0. Ground rules (read first, apply to every phase)

1. **Never** modify or print `.env`. Never add secrets to `VITE_*` variables. Never commit credentials.
2. **No blockchain transactions.** Use only RPC reads (`eth_call`, `eth_getBalance`, …).
3. **Do not push, deploy or tag remotely** without explicit user approval.
   - Pushing `main` triggers a Vercel production deploy.
   - Steps that need approval are marked **🛑 USER CONFIRM**.
4. **No backend changes** are planned. `apps/api/**` stays untouched, so Render needs no redeploy. If you think a backend change is needed, stop and ask.
5. Follow `DESIGN.md` strictly.
   - Keep the existing palette, Geist fonts and the 3-cell asymmetric ledger. Never three equal cards.
   - No emoji, no glow, no invented numbers.
   - When data is missing or stale, show "unavailable/unknown". Never fabricate.
6. Reuse the existing CSS classes (`panel`, `info-card`, `callout`, `callout warning`, `hint`, `metric`, `metrics`, `borrowing-values`, `skeleton-line`, `button`, `button secondary`, `text-button`, `eyebrow`, `section-heading`). Put any new CSS at the end of `apps/web/src/refinements.css`.
7. **Preserve user-visible strings that tests assert.** Before changing or removing any text, run `rg "<text>" tests` to check whether a test asserts it. If a string must change, update the test in the same commit and explain why.
8. Preserve existing comments and docstrings.
9. pnpm may not be installed globally. If `pnpm` is not found, use:
   ```powershell
   npm exec --yes --package=pnpm@10.34.6 -- pnpm <args>
   ```
10. **Standard verification** (referred to below as **VERIFY**):
    ```powershell
    pnpm typecheck
    pnpm test
    pnpm build
    pnpm test:browser
    pnpm format:check
    ```
    Add `pnpm test:contracts` only if `contracts/**` changes (it should not).
11. Commit messages: imperative sentence, matching the existing history style (e.g. `Split overview routes into components and hooks`).

---

## Phase 0: Baseline and pending files

**Goal:** account for pending work and establish a verified baseline before any refactor. The untracked plan remains until Phase 8; unrelated user changes are preserved and documented.

1. `git status --short`. The following were pending when this plan was written; inspect the actual tree before acting:
   - `M HANDOFF.md`
   - `?? deployments/wallet-setup-release.check.json`
   - `?? plan.md` (this file). Leave it uncommitted until Phase 8, then commit it with the docs.
   Preserve all unrelated work. If these files are already committed, skip their commit; do not recreate changes or stage unrelated files. The tree may retain the untracked plan until Phase 8.
2. Scan both pending evidence files for secrets before staging them. These searches must return nothing sensitive:
   ```powershell
   rg -n -i "mongodb\+srv|GEMINI_API_KEY=|AIza|private[_ ]?key|BEGIN .*PRIVATE" HANDOFF.md deployments/wallet-setup-release.check.json
   ```
3. Commit only those two files:
   ```powershell
   git add HANDOFF.md deployments/wallet-setup-release.check.json
   git commit -m "Record wallet setup release evidence and handoff"
   ```
4. Run **VERIFY** once to record a green baseline. Also note the current build chunk sizes from the `pnpm build` output; you need them for Phase 2.
5. **Do not tag yet.** Create the local `wave1` tag and push it only after the Phase 8 production checks pass and the user explicitly approves tagging. It must point to the exact final release commit that passed those checks.

---

## Phase 1: Split `App.tsx` into routes and hooks (pure refactor)

**Goal:**
- `apps/web/src/App.tsx` (915 lines) becomes a thin container.
- **Zero behaviour or DOM-text change.** All existing browser tests must pass unmodified.

### 1.1 Target structure

```
apps/web/src/
  App.tsx                      # thin: shell + topbar + callouts + route switch
  format.ts                    # errorText, short, amount (moved from App.tsx)
  hooks/
    useDeploymentReadiness.ts  # the 'deployment' useQuery (lines ~72-118)
    useBalances.ts             # the 'balances' useQuery (lines ~120-140)
    useSchedules.ts            # the 'schedules' useInfiniteQuery + scheduleRows/snapshot/outstanding
    usePaymentActions.ts       # transaction(), waitTracked(), settle(), create(), notice/hash/busy state
  routes/
    Overview.tsx               # ledger + schedule list + info-grid (view === 'overview' && !scheduleId)
    NewSchedule.tsx            # the create form panel (view === 'create')
    ScheduleDetail.tsx         # /schedules/:id view (same list UI, scheduleId set)
  components/
    TreasuryLedger.tsx         # the <section className="metrics"> block
    ScheduleList.tsx           # schedule-list + loading + empty state + pagination footer
    ScheduleCard.tsx           # one <article className="schedule-card">
```

### 1.2 Rules

- Keep the hook query keys **byte-identical** to the current ones. The Phase 4 planner depends on sharing these react-query cache entries.
  - `['deployment', musdAddress, paymentAddress]`
  - `['balances', address, chainId, musdAddress]`
  - `['schedules', TESTNET_CHAIN_ID, client?.transport.url, address, chainId, paymentAddress, scheduleId?.toString()]`
- `useSchedules({ address, chainId, scheduleId, readiness })` returns `{ query, rows, snapshot, outstanding }`. `outstanding` uses exactly the current formula: sent-by-connected-account, `(cancelled ? vestedAtCancellation : total) - claimed`.
- `usePaymentActions({ client, wallet, address, chainId, readiness, recovery, balances, schedules, decimals, onCreated })` must keep:
  - the exact error messages and notices
  - the two-minute start buffer comment
  - the `recovery.checkStorage()` calls
  - the replacement handling
  - the `window.history.replaceState(null, '', '/')` call after creation
- `App.tsx` keeps:
  - the `view`/`scheduleId`/`invalidRoute` parsing
  - `<Sidebar active=…>`
  - the topbar, page heading and wrong-network/readiness/notice/recovery callouts
  - `PendingTransactionPanel`
  - the footer

  It then renders `<NewSchedule>`, `<ScheduleDetail>`, `<Overview>`, or the existing "Schedule link not found" panel.
- `Router.tsx` still renders `<App key={`${route}:${revision}`} />`. Keep the remount semantics.
- Components receive data via props. Do not create new contexts unless prop drilling exceeds three levels.

### 1.3 Acceptance

- `App.tsx` < 250 lines. No component file > 300 lines.
- **VERIFY** green with **no test edits**.
- Commit: `Split overview routes into components and hooks`.

---

## Phase 2: Lazy routes and wallet chunk (fix the bundle warning)

### 2.1 Lazy routes in `apps/web/src/Router.tsx`

- Keep `App` eager. It is the landing route.
- Lazy-load `Assistant`, `Documentation`, `Workspace` and `Borrowing`. They are named exports, so:
  ```ts
  const Workspace = lazy(() =>
    import('./Workspace').then((m) => ({ default: m.Workspace })),
  );
  ```
- Wrap the route switch in `<Suspense fallback={<RouteFallback />}>`.
  - Create `apps/web/src/RouteFallback.tsx`: a dimension-preserving skeleton inside the normal `shell` layout. Render `<Sidebar />` and a `content` area with 2–3 `skeleton-line` elements, plus `role="status"` and visually hidden text "Loading page…".
  - Reduced-motion rules already exist. Reuse them.
- Do **not** change the `navigate()` regex or the popstate logic.

### 2.2 Vendor chunks in `apps/web/vite.config.ts`

Vite 8 uses Rolldown, so the option name matters. First check which option the installed version supports:
```powershell
rg -n "advancedChunks|codeSplitting|manualChunks" node_modules/vite/dist/node/index.d.ts
```

- **Preferred** (if `advancedChunks` or `codeSplitting` exists): use `build.rolldownOptions.output.advancedChunks.groups` (or the equivalent) with these groups, highest priority first:
  - `wallet`: `/node_modules[\\/](wagmi|@wagmi|viem|ox|abitype|@noble|@scure|@adraffy)[\\/]/`
  - `react`: `/node_modules[\\/](react|react-dom|scheduler)[\\/]/`
  - `query`: `/node_modules[\\/]@tanstack[\\/]/`
- **Fallback:** `build.rollupOptions.output.manualChunks(id)` with the same three groups.
- Keep `resolve.dedupe: ['viem']`, `envDir` and `server.proxy` unchanged.
- **Do not** raise `chunkSizeWarningLimit` as the fix.

### 2.3 Acceptance

- `pnpm build` prints **no** "chunks are larger than 500 kB" warning.
- Record before/after chunk sizes in the Phase 8 HANDOFF entry.
- Deep links still work on hard reload. Navigation tests cover this; additionally run `pnpm --filter @runway/web preview` and open `/docs`, `/workspace`, `/borrowing`, `/assistant` and `/schedules/1` directly.
- `vercel.json` rewrites still serve `index.html` for those paths. Inspect the file, do not change it.
- **VERIFY** green.
- Commit: `Lazy-load secondary routes and split vendor chunks`.

---

## Phase 3: MEZO token balance in the ledger (ISSUE-07)

### 3.1 Verify the token address on chain first (read-only)

The candidate MEZO address on Mezo testnet (chain 31611) is the system precompile `0x7B7c000000000000000000000000000000000001`. **Do not trust it until verified.** Create the ignored helper `.tools/verify-mezo-token.mjs`:

```js
import { createPublicClient, http, erc20Abi } from 'viem';
const client = createPublicClient({ transport: http('https://rpc.test.mezo.org') });
const address = '0x7B7c000000000000000000000000000000000001';
const [chainId, symbol, decimals, name] = await Promise.all([
  client.getChainId(),
  client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
  client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
  client.readContract({ address, abi: erc20Abi, functionName: 'name' }),
]);
console.log({ chainId, symbol, decimals, name });
```

Run it with `node .tools/verify-mezo-token.mjs`.
- **Expected:** `chainId: 31611`, `symbol: 'MEZO'`, `decimals: 18`.
- **If it is not MEZO:**
  1. Check the official docs: https://mezo.org/docs/developers/ (contracts / tokens page).
  2. Also check the explorer token list: https://explorer.test.mezo.org/tokens.
  3. Verify the alternative address the same way.
  4. If you still can't verify, **stop and ask the user**. Do not guess.

### 3.2 Implementation

1. `packages/mezo/src/index.ts`: add `export const MEZO_TESTNET_TOKEN = getAddress('<verified address>');` with a comment saying how and when it was verified.
2. `apps/web/src/config.ts`:
   ```ts
   export const mezoTokenAddress =
     optionalAddress(import.meta.env.VITE_MEZO_TOKEN_ADDRESS) ?? MEZO_TESTNET_TOKEN;
   ```
   Add `VITE_MEZO_TOKEN_ADDRESS=<verified address>` to `.env.example` only (not `.env`).
3. `hooks/useDeploymentReadiness.ts`:
   - Validate MEZO in a **separate, non-blocking query**: `['mezo-token', mezoTokenAddress]`, `staleTime: Infinity`.
   - Check chain 31611, `symbol() === 'MEZO'`, and `decimals() === 18` using successful ABI-decoded RPC reads. Record bytecode as verification evidence, but do not require bytecode for an officially verified native precompile: native precompiles can return empty code. Corroborate the default address and its native implementation with official Mezo documentation or source, recording the source and verification date. For other configured addresses, require deployed bytecode as well as the metadata checks. Metadata alone does not prove token identity.
   - MEZO validation failure must **never** disable payments.
4. `hooks/useBalances.ts`:
   - When MEZO is validated, read `balanceOf(address)` at the **same pinned `blockNumber`** as BTC/MUSD. Keep the query key, adding `mezoTokenAddress` at the end.
   - Return `mezo?: bigint`. Include the MEZO validation state in the balance query identity (in addition to the token address), or explicitly invalidate/refetch on validation success, so an early BTC/MUSD-only result cannot indefinitely suppress the MEZO read. MEZO read failures must preserve BTC/MUSD results and payment availability.
5. `components/TreasuryLedger.tsx`: keep **three cells** (DESIGN.md). Change the third cell from "GAS RESERVE" to show BTC as the primary value and MEZO as a secondary line:
   - Label: `GAS RESERVE` (unchanged; grep tests).
   - Value: `{btc} BTC` (unchanged).
   - Add the line `<p className="hint mono">{mezo} MEZO · Mezo network token</p>`. If unavailable: `MEZO balance unavailable`. If disconnected: `—`.
   - Keep the existing "Used for approvals, funding and claims" text.
6. Add a Playwright test, `tests/mezo-balance.spec.ts`. Copy the RPC-mocking pattern from `tests/borrowing.spec.ts` and `tests/wallets.spec.ts`. Cases:
   - Valid MEZO → the balance is shown.
   - `symbol !== 'MEZO'` → "MEZO balance unavailable", **and** funding remains enabled.
7. Update `apps/web/src/guide.ts` with one sentence in the overview/balances section, then run `pnpm docs:generate`.

### 3.3 Acceptance

- **VERIFY** green.
- Commit: `Show validated MEZO balance in the treasury ledger`.

---

## Phase 4: Runway planner (main feature)

**Story:** *Live off your Bitcoin → pay your team.* Combine data that is already validated:
- Payment schedules (`useSchedules`)
- Wallet MUSD (`useBalances`)
- The verified borrowing snapshot (`readBorrowingPosition`)

The planner answers two questions:

1. **"Payroll covered until …"**: how long every currently active payment stream can continue, renewing each at its existing rate when its escrow ends and using wallet MUSD for those renewals. A later-ending schedule cannot pay for an earlier-ending one.
2. **"Can you fund another N months?"**: whether additional MUSD borrowable against your BTC under a chosen stress scenario and target ratio covers N more months at the current rate.

There are no new protocol writes. Borrowing happens via a deep link to Mezo.

### 4.1 Pure math in `packages/mezo/src/planner.ts`

All values are bigint base units: 18-decimal MUSD, and ratios scaled 1e18 as in `borrowing.ts` (`ratio = collateral * price / debt`). Export the file from `packages/mezo/src/index.ts`.

```ts
const DAY = 86_400n;
export const MONTH_SECONDS = 30n * DAY; // planning month = 30 days (label it in UI)

export type PlannerSchedule = {
  sender: string; total: bigint; claimed: bigint;
  start: bigint; end: bigint; cancelled: boolean;
};

/** Active = sent by `account` (case-insensitive address comparison), not cancelled, start <= chainTime < end; require end > start and total > 0. Future schedules are excluded from the current-rate projection. */
export function activeSchedules(rows: readonly PlannerSchedule[], account: string, chainTime: bigint);

/** Sum of ceil(total/(end-start)) over active schedules, in base units per second. Round up per schedule so cost is never understated and positive streams never become zero-rate. */
export function paymentRatePerSecond(active: readonly PlannerSchedule[]): bigint;

/** Earliest `end` among active schedules, or undefined: all current streams are escrow-funded through this time. */
export function fundedThrough(active: readonly PlannerSchedule[]): bigint | undefined;

/** Conservative coverage timestamp, or undefined if no active streams. Validate walletMusd >= 0. */
export function payrollCoveredUntil(active: readonly PlannerSchedule[], walletMusd: bigint): bigint | undefined;
// Sort/group schedule end timestamps. At each end, add that stream's rounded-up
// rate to the renewal rate. Before the first end, escrow covers every stream.
// Between ends, wallet cost = renewalRate * elapsedSeconds. If the wallet cannot
// cover the next interval, return intervalStart + walletRemaining / renewalRate
// (floor). Otherwise subtract its cost and continue. After the last end, extend
// by walletRemaining / totalRate. Handle simultaneous ends as one event.
// Do not count unclaimed escrow as wallet funds or reuse one stream's escrow
// for another. This assumes immediate renewal with no payment gaps.

/** Max additional MUSD debt keeping (collateral * stressedPrice / (debt + extra)) >= targetRatio. Never negative. */
export function borrowingHeadroom(p: {
  collateral: bigint; debt: bigint; price: bigint;
  dropPercent: number;      // integer 0..100, same validation as borrowingStress
  targetRatio: bigint;      // must be > minimumRatio
  minimumRatio: bigint;
}): { stressedPrice: bigint; maxDebt: bigint; headroom: bigint };
// stressedPrice = price * (100 - drop) / 100
// maxDebt = collateral * stressedPrice / targetRatio   (floor → conservative)
// headroom = maxDebt > debt ? maxDebt - debt : 0n
// Validate collateral >= 0, debt >= 0, original price > 0, minimumRatio > 0,
// targetRatio > minimumRatio, and integer dropPercent in 0..100.
// Reject negative collateral/debt, invalid ratios/prices, fractional drops,
// NaN and Infinity. Zero debt/collateral and a 100% drop are valid pure-math
// inputs; stressedPrice may be zero. The UI still requires an active verified
// loan and must not infer new-loan eligibility from this helper.

/** MUSD needed for `months` more planning months at `rate`. */
export function requiredForMonths(rate: bigint, months: number): bigint; // integer months 1..24

/** Whole planning months that `amount` covers at `rate` (floor). undefined if rate == 0n. */
export function monthsCovered(amount: bigint, rate: bigint): bigint | undefined;
```

Reject negative amounts/rates in the month helpers; zero rate is valid (`requiredForMonths` returns `0n`, `monthsCovered` returns `undefined`). Validate months even when rate is zero. The UI suppresses coverage verdicts for zero rate.

**Unit tests** go in `packages/mezo/test/planner.test.ts` (Vitest; follow `test/stress.test.ts`). Cover:
- Rate summing with mixed durations; conservative ceiling rounding, including tiny positive streams
- Cancelled, future, ended and not-sent-by-account schedules excluded; exact start/end boundaries and address casing
- `fundedThrough` with none, one and many schedules (earliest end, not latest)
- Piecewise coverage with unequal end dates, simultaneous ends, zero wallet, exact interval boundaries and wallet remaining after the final end. Regression: two streams at 1 base unit/s ending at t=100 and t=200, with wallet=50, cover only through t=150 (not t=225).
- Headroom: zero when already above `maxDebt`; exact boundary; 100% drop → headroom 0; `targetRatio <= minimumRatio` throws
- Headroom accepts zero debt/collateral; rejects negative inputs, zero original price, and invalid drop values
- `monthsCovered` with rate 0 → undefined; `requiredForMonths` bounds validation

### 4.2 Share the borrowing query

Extract the position query from `BorrowingPosition.tsx` into `apps/web/src/hooks/useBorrowingPosition.ts`.
- Keep the **same query key**: `['borrowing', TESTNET_CHAIN_ID, client?.transport.url, account, musdAddress]`.
- Keep the same options.
- Move the 10-second `now` ticker and the `stale` / `price` derivation in as well.
- The hook returns `{ query, data, stale, price }`.

`BorrowingPosition` uses the hook. Its behaviour and DOM must be unchanged; all 10 `borrowing.spec.ts` cases pass untouched.

### 4.3 `apps/web/src/RunwayPlanner.tsx` (full planner, on `/borrowing`)

Place it in `Borrowing.tsx` **directly below** `<BorrowingPosition />` inside `borrowing-layout`, as `<section id="runway-planner" className="panel runway-planner" aria-label="Runway planner">`.

**Inputs (read-only data):**
- Connected `address` only. If `BorrowingPosition` is showing a different entered address, the planner shows: "The planner uses your connected wallet's schedules and loan."
- `useDeploymentReadiness`, `useBalances`, `useSchedules({ scheduleId: undefined })`, `useBorrowingPosition(address)`.

**Gating (show an explicit reason, never partial numbers):**

| Condition | Message |
|---|---|
| No wallet | "Connect your wallet to plan your runway." |
| Wrong chain | Reuse the existing wrong-network wording |
| Deployment readiness loading | Show a loading skeleton; do not calculate |
| Deployment readiness failed or invalid | Reuse the existing deployment-validation reason; do not calculate |
| Schedules/balances initially loading, required snapshot missing, or data belongs to another account/chain | Show a loading/unavailable state as appropriate; do not calculate or show an empty-schedules message |
| Payments snapshot stale or refresh failed with cached data | Show "Payment data unavailable · refresh to retry."; suppress coverage dates/verdicts. Reuse an existing freshness threshold or define and test one explicitly before implementation |
| `schedules.hasNextPage` | "Load all schedules on Overview to plan accurately." + link `/` |
| Schedules or balances error | "Payment data unavailable · refresh to retry." |
| No active sent schedules | Show wallet MUSD and borrowing headroom; replace runway lines with "No active payment schedules. Fund one to see your runway." |
| Borrowing not active / stale / no price | Section B shows the same "Loan health unknown…" reason as `BorrowingPosition`; section A still works |
| Borrowing loading, failed, or missing snapshot | Section B shows a loading state or the existing borrowing error reason; no capacity/verdict. Section A still works with valid payment data |

Only evaluate the no-active-schedules case after successful, complete, fresh payment reads. Never replace missing values with zero. Section B additionally requires a valid selected target ratio. If no preset exceeds `minimumRatio + 10 percentage points` (0.10 scaled by 1e18), show an explicit unavailable reason; do not call the helper with a disabled/invalid selection. If the default becomes invalid, select the lowest enabled preset. Follow `BorrowingPosition`'s actual state-specific reasons rather than labeling an inactive loan as a stale oracle.

**Section A: "Payroll covered until"**
- Payment rate: `{rate * DAY} MUSD / day`, formatted to 2 decimals with tabular figures.
- Funded through: `fundedThrough` as a local date, labeled "All current streams funded through". Hint: "Existing schedules are fully funded in escrow."
- Wallet extension: `(payrollCoveredUntil - fundedThrough) / DAY` days, rounded down; disclose that renewal spending grows as each existing schedule ends.
- **Headline:** `Payroll covered until <payrollCoveredUntil, local date>`.
  - Caveat hint: "Assumes each current payment stream renews immediately at its existing rate, using wallet MUSD as its escrow ends. Future-starting schedules are excluded. Rates round up conservatively. Planning month = 30 days."
  - Show future-starting schedule count separately when nonzero so its exclusion is visible. Existing escrow stays allocated to its original stream; claimed amounts do not become available wallet funds unless already included in the wallet balance.

**Section B: "Can you fund another N months?"**

Controls (all ≥ 44 px targets, labels above):
- **Months:** number input 1–24, default 3.
- **BTC price drop:** range 0–100, default 20. Use the same presets as `BorrowingStress` (0/10/20/30/50) as small secondary buttons.
- **Target collateral ratio:** select 150% / 200% / 250%, default 200%. Disable options ≤ `minimumRatio + 10%`.

Outputs:
- Needed: `requiredForMonths(rate, months)` MUSD.
- Define this as N additional 30-day months for all current streams at the full current rate, funded solely by additional borrowing capacity. It does not consume current escrow or wallet funds and must not be added to Section A's date as a continuous-coverage promise.
- Additional borrowing capacity at this scenario: `headroom` MUSD (from `borrowingHeadroom`, using snapshot `collateral`, `debt`, `price`, `minimumRatio`).
- Verdict:
  - If `headroom >= needed`: a `hint` line reading "Covered in this scenario: borrowing ≈ X MUSD keeps your ratio at or above Y% after a Z% BTC drop."
  - Otherwise: a `callout warning` reading "Not covered in this scenario: about W MUSD short." Also show `monthsCovered(headroom, rate)` as "covers about K months".
- **Mandatory caveat** (`hint`): "Estimate only, not a borrowing quote. Excludes Mezo borrowing fees, minimum debt, gas compensation on new debt, future interest and system-wide recovery conditions. Treats 1 MUSD as 1 USD, as protocol debt accounting does."

**Primary CTA:** `<a className="button" href="https://testnet.mezo.org" target="_blank" rel="noreferrer">Borrow more MUSD in Mezo ↗</a>`.
- First check (read-only HTTP GET) whether a more specific borrow route such as `https://testnet.mezo.org/borrow` returns 200. If it does, use it; otherwise keep the root URL.
- Secondary link: `Fund a schedule →` pointing to `/?create=1`.

**Footer hint:** "Snapshot: payments block {snapshot.blockNumber} · borrowing block {position.blockNumber}." If the two chain times differ by more than 120 s, prefix "Data from different blocks ·" (honest disclosure). Render only identifiers that are available; when borrowing is unavailable, show the payments block alone and the borrowing-unavailable reason instead of dereferencing a missing position.

### 4.4 Compact summary on Overview

In `routes/Overview.tsx`, replace the content of the existing right-hand `info-card light` ("MEZO BORROWING") with a compact **Runway** card. Keep the `info-grid` layout and two-card asymmetry.
- Eyebrow `RUNWAY · BTC-BACKED PAYROLL`; h2 `Your team, funded forward.`
- When data is available: one line "Payroll covered until <date>" and one line "<rate>/day across N active schedules". Otherwise: "Connect and fund a schedule to see your runway."
- Use the same active-stream filter, conservative rates, piecewise coverage helper and payment-data gates as the full planner. Distinguish loading, incomplete pagination and unavailable data from the disconnected/no-active-schedules fallback. Show the renewal/future-schedule assumption in a short hint.
- Keep a link with the **existing text** `View borrowing` (grep `tests/navigation.spec.ts` first) pointing to `/borrowing`. Add a second link: `Plan with your BTC loan →` (`/borrowing`).
- The Overview card must **not** call the borrowing RPC. It uses only schedules and balances already loaded, so Overview doesn't get slower.

### 4.5 Styling

Append a `/* Runway planner */` block to `refinements.css`:
- Two-column grid on desktop (A | B), single column below 768 px.
- Headline value in Geist Mono with tabular numbers.
- Range control and select use the existing input styles.
- No new colours. Forest green only for the primary CTA and focus.
- Check at 320 px: no horizontal overflow.

### 4.6 Tests

`tests/planner.spec.ts` (Playwright). Reuse the RPC mock from `borrowing.spec.ts` and the schedule mocks from `schedules.spec.ts`. Cases:
1. Active loan + 2 active schedules → shows "Payroll covered until", rate/day and the "Covered in this scenario" verdict.
2. Increase the drop to 50% → the verdict flips to "Not covered" with a shortfall.
3. Stale borrowing block → section B shows "Loan health unknown"; section A is still visible.
4. No active schedules → the "No active payment schedules" message; headroom still shown.
5. Partial schedule pagination → the "Load all schedules on Overview" gate.
6. Viewport 320 px → `document.documentElement.scrollWidth <= 320`.
7. The CTA has `target="_blank"` and the expected href.
8. Unequal schedule end dates produce the piecewise coverage date; future-starting schedules are disclosed and excluded from the current rate.
9. Loading, failed readiness, missing/stale payment snapshots and account changes never show fabricated zero balances, empty-schedule claims or coverage dates. Borrowing failures leave valid Section A visible.
10. No eligible target-ratio preset shows an explicit reason and no verdict; zero current rate shows headroom but no "Covered" verdict.

### 4.7 Docs

- `apps/web/src/guide.ts`: add a "Runway planner" section (what it shows, assumptions, that it never borrows for you). Then run `pnpm docs:generate`.
- `docs/borrowing.md`: add a "Runway planner" section with the formulas from 4.1 and the caveats.
- Do **not** edit `docs/assistant-knowledge.md`. It is served by the Render backend and would require a backend redeploy. Note it as follow-up in HANDOFF.

### 4.8 Acceptance

- **VERIFY** green, including the new unit and browser tests.
- Commit: `Add Runway planner linking BTC borrowing capacity to payroll coverage`.

---

## Phase 5: Render cold-start UX ("Waking backend…")

**Context:** Render's free tier sleeps after about 15 minutes of inactivity. While it wakes, the Vercel `/api/*` proxy may hang, return 502/503/504, or return a non-JSON HTML page. Today `Workspace.tsx` and `Assistant.tsx` show a generic "unavailable" error. `GET /api/health` returns `{ status: 'ready', database: 'connected' }` (200) when ready, or JSON 503 when MongoDB is unreachable.

### 5.1 `apps/web/src/api.ts` (new)

```ts
export class BackendUnavailableError extends Error {
  constructor(public reason: 'timeout' | 'network' | 'gateway' | 'non-json') { super('BACKEND_WAKING'); }
}
export async function apiFetch(input: string, init: RequestInit = {}, timeoutMs = 12000): Promise<Response>
// - AbortController timeout → BackendUnavailableError('timeout') (respect a caller-provided init.signal too)
// - fetch TypeError → 'network'
// - status 502/503/504 with non-JSON content-type → 'gateway'
// - returns the Response otherwise (callers keep their own status handling)
export async function readJson<T>(response: Response): Promise<T>
// - JSON parse failure → BackendUnavailableError('non-json')
```

### 5.2 `apps/web/src/hooks/useBackendWake.ts` (new)

- State machine: `idle | waking | ready | failed`, plus `elapsedSeconds`.
- `wake()`:
  - Poll `GET /api/health` via `apiFetch` (8 s timeout) every 3 s, for up to **90 s** total.
  - `ready` when the response is JSON with `status === 'ready'`.
  - A JSON 503 (database) counts as failed, with the message "Backend is awake but its database is unavailable."
- `retry()` restarts polling. Clean up timers on unmount (React StrictMode-safe).
- `onReady` callback lets callers refetch.

### 5.3 `apps/web/src/BackendWakeNotice.tsx` (new)

- **Waking:** `<div className="callout" role="status" aria-live="polite">`
  - Text: "Waking the Runway backend… Free hosting pauses after inactivity; this usually takes 30–60 seconds. ({elapsed}s)"
  - Plus one `skeleton-line`.
- **Failed:** `callout warning` with `role="alert"`
  - Text: "The backend is still unavailable."
  - A button with the **existing text** `Retry connection` (it is asserted in tests; grep first).
- Respect reduced motion. Reuse the skeleton animation rules.

### 5.4 Wire it in

- **`Workspace.tsx`:**
  - Switch `request()` and the session query to `apiFetch`/`readJson`.
  - If the session query fails with `BackendUnavailableError`, call `wake()`, render `<BackendWakeNotice>` instead of the generic error, and `session.refetch()` automatically on ready.
  - Disable the "Sign in" button while waking.
  - Keep all other error texts for real API errors (401/403/400).
- **`Assistant.tsx`:**
  - On `BackendUnavailableError` from `/api/assistant/chat`, show `<BackendWakeNotice>`.
  - Keep the user's question in the composer so they can resend once ready. **Do not auto-resend**, since it would consume quota.
- **Pre-warm:** in `App.tsx` (Overview), on mount, schedule one fire-and-forget `fetch('/api/health')` via `requestIdleCallback` (fallback `setTimeout(…, 2000)`). Run it at most once per tab session (`sessionStorage` flag `runway:prewarm`). Ignore all errors. This wakes Render while a judge looks at Overview.
  - **Browser tests:** the fixture API may not exist on every spec. Make sure the pre-warm request failing produces no console errors that tests assert on. If needed, guard it with `import.meta.env.PROD`.

### 5.5 Tests

`tests/backend-wake.spec.ts`:
1. `/api/auth/session` returns HTML 502 twice, `/api/health` returns 502 then `{status:'ready',database:'connected'}`, then the session returns 401 → the wake notice appears, then the sign-in panel.
2. Health never ready (use `page.clock` or shorten the limit via a test-only query param). Expect the failed notice and the `Retry connection` button; clicking Retry restarts polling.
3. Assistant: chat POST times out → the wake notice appears and the question stays in the input.

### 5.6 Acceptance

- **VERIFY** green. Existing `workspace.spec.ts` and `assistant.spec.ts` pass untouched.
- Commit: `Show waking-backend state with retry for cold Render starts`.

---

## Phase 6: Optional keep-alive during judging windows

Create `.github/workflows/keepalive.yml`. Before enabling it remotely, verify current Render free-tier allowances/terms and GitHub scheduling behavior using official documentation; record the date and sources in HANDOFF. Treat the judging dates below as intended inclusive windows (October 26–November 2 and November 15–23, 2026); confirm them against the submission schedule before release:

```yaml
name: Keep backend warm (judging windows)
on:
  schedule:
    - cron: '*/10 * * * *'
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - name: Ping only inside judging windows (UTC)
        run: |
          today=$(date -u +%Y-%m-%d)
          if [[ "$GITHUB_EVENT_NAME" == "workflow_dispatch" ]] \
             || [[ "$today" > "2026-10-25" && "$today" < "2026-11-03" ]] \
             || [[ "$today" > "2026-11-14" && "$today" < "2026-11-24" ]]; then
            curl -fsS --max-time 90 https://mezo-runway-testnet.vercel.app/api/health
          else
            echo "Outside judging windows; skipping."
          fi
```

**Notes for the HANDOFF entry:**
- GitHub cron is best-effort and may be delayed.
- Record the actual current free-hours allowance and workspace consumption. A service running continuously for a 31-day month uses approximately 744 hours; do not assume an unchanged 750-hour allowance or that no other services share it.
- Keeping the service warm also keeps the embedded payment indexer caught up.
- The workflow only hits the public health route. It needs no secrets.

Commit: `Add judging-window keep-alive ping for the Render backend`.

---

## Phase 7: `SECURITY.md` and threat model

Create a root `SECURITY.md`. **Base every statement on the actual code and docs.** Read these first:
- `contracts/src/RunwayPayments.sol`
- `contracts/test/**`
- `docs/security-testing.md`
- `docs/explorer-verification.md`
- `docs/backend.md`
- `docs/ai-assistant.md`
- `docs/payment-reconciliation.md`
- `apps/api/src/app.ts` (auth/origin/rate limits)

Do not invent guarantees.

### Required sections

1. **Status banner** (GitHub `> [!WARNING]`): "Testnet prototype. **Not audited.** Do not use with mainnet funds."
2. **Scope and deployments:**
   - Payment contract `0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D` (explorer-verified; link it)
   - MUSD `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`
   - Chain 31611, Solidity 0.8.28, OpenZeppelin 5.0.2, London EVM
3. **Contract invariants.** Each one must point to the line(s) or test(s) that enforce or check it:
   - Escrow conservation: contract MUSD balance ≥ `outstandingObligations`.
   - Per schedule: `claimed ≤ vested ≤ total`; after cancellation, `vested == vestedAtCancellation`.
   - Claims always transfer to the immutable `recipient`, regardless of caller.
   - Only `sender` can cancel, only before `end`, and only once. Refund = `total − vested(at cancel)`.
   - Full upfront funding. Fee-on-transfer or short-transfer tokens are rejected (`UnsupportedToken` balance-delta check).
   - `nonReentrant` on all state-changing functions; checks-effects-interactions ordering.
   - No owner, admin, upgrade, pause, fee or arbitrary-withdrawal paths.
   - Linear vesting uses `Math.mulDiv`, rounding down (in the sender's favour until `end`).
   - Pagination `limit ≤ 100`.
4. **Trust assumptions:**
   - MUSD token behaviour, including that the MUSD contract may be upgradeable by Mezo governance. Verify via the explorer/proxy slot and state what you found.
   - Validator-controlled `block.timestamp`.
   - The Mezo price oracle (borrowing views are read-only).
   - Hosting: Vercel (frontend), Render (API), MongoDB Atlas.
   - The Gemini provider for the assistant.
   - The user's wallet software.
5. **Off-chain threat model** (table: asset → threat → mitigation → residual risk). Cover:
   - Wallet login: domain-bound, 5-minute, single-use challenges; HTTP-only 1-day revocable cookies
   - Origin checks on non-GET requests
   - DB-backed rate limits
   - Owner isolation of workspaces
   - Invoice references are opaque
   - Assistant: bounded context, no wallet/DB tools, fixed refusals, quota caps (requests, not dollars); prompt injection mitigated but not mathematically prevented
   - Frontend: no secrets in `VITE_*`; pending-transaction recovery stored in `localStorage`
6. **Known limitations / out of scope:**
   - Tokens sent directly to the contract are unrecoverable.
   - Anyone can create schedules to any recipient (spam in recipient lists; lists are paginated).
   - Schedules cannot be edited; the recipient is immutable.
   - No independent audit or formal verification.
   - Read-only borrowing; planner figures are estimates.
   - Render free-tier availability.
   - Mainnet is out of scope.
7. **Testing evidence:** derive current Foundry test counts, fuzz coverage, stateful invariant campaigns and adversarial token/reentrancy cases from the actual tests and successful test output. Verify the CI workflow name and checks in `.github/workflows` (expected `checks.yml`). Link `docs/security-testing.md`; reconcile outdated counts instead of assuming the previously reported 24 tests/two campaigns are still current.
8. **Reporting a vulnerability:** use GitHub private vulnerability reporting (Security → Advisories) on `SupunThk/runway`. Leave `<!-- TODO(user): add contact email -->` for the user. Do not invent an email.

Link `SECURITY.md` from `README.md`, replacing the sentence "The current source is a testnet prototype and has not received independent security review." with a link that keeps the same meaning.

Commit: `Add security policy and threat model`.

---

## Phase 8: Docs, final verification, commit and `wave1` tag

1. **`README.md`:** add short bullets for the Runway planner, the MEZO balance, the cold-start notice and the `SECURITY.md` link. Keep the existing tone, and don't rewrite unrelated sections.
2. **`HANDOFF.md`:** add a new top entry, "Implementation history: Wave 1 polish, <date>", in the existing style. Include:
   - What changed, per phase, with commit hashes
   - Test counts (unit/API and browser) and before/after bundle sizes
   - The MEZO address verification evidence
   - That no backend, contract or `.env` changes and no transactions occurred
   - Follow-ups: `assistant-knowledge.md` planner entry (needs a Render redeploy), real installed-wallet validation, Vercel env var `VITE_MEZO_TOKEN_ADDRESS` (optional, since the code has a verified default)
3. **Full checks:** run **VERIFY**, plus `pnpm test:contracts` once as a sanity check (no contract changes expected). Also check:
   ```powershell
   git diff --check
   rg -n -i "mongodb\+srv|AIza|BEGIN .*PRIVATE" apps packages docs README.md SECURITY.md
   ```
   After `pnpm build`, scan `apps/web/dist` for the same patterns. Both scans must contain no real credentials. The pre-existing instructional `mongodb+srv://<username>:<password>@<cluster>/...` placeholder in `docs/backend.md` is an expected source-scan match, not a credential. The broad case-insensitive `BEGIN .*PRIVATE` regex can also span minified vendor JavaScript from an `onBegin` property through an unrelated private-field error; review and record such matches, checking actual PEM private-key markers separately. Never delete useful docs or alter vendor code solely to force an empty broad-regex result. Unreviewed matches block release.
4. Commit: `Document Wave 1 polish release`.
5. **🛑 USER CONFIRM: push and deploy.** Print a summary (commits, test results, bundle sizes) and wait for approval. Then:
   ```powershell
   git push origin main
   ```
   - This triggers the Vercel production build.
   - Wait for it to be READY. Check hosted `/`, `/borrowing`, `/workspace` (wake notice), `/assistant`, `/docs` and `/schedules/1` at 1440 px and 390 px, with no console errors.
   - Confirm GitHub CI `Checks` is green on the pushed commit.
6. **🛑 USER CONFIRM: tag.** Only after the hosted checks pass:
   ```powershell
   git tag -a wave1 <verified-release-commit-sha> -m "Mezo Buildathon Wave 1 submission baseline"
   git push origin wave1
   ```
   Replace the placeholder with the exact pushed release SHA that passed hosted checks and CI. First check whether `wave1` already exists locally/remotely; never overwrite or move an existing tag without explicit user approval. No local tag is created before this approval step.

   In Wave 2, `git diff wave1..main` shows the "meaningful new progress".

---

## Quick checklist

- [x] P0: Pending HANDOFF and evidence committed, baseline green
- [x] P1: `App.tsx` split, tests untouched and green
- [x] P2: Lazy routes and vendor chunks, no 500 kB warning
- [x] P3: MEZO address verified on chain, balance in ledger cell 3, non-blocking
- [x] P4: `planner.ts` and tests, `useBorrowingPosition`, `RunwayPlanner`, Overview card, docs
- [x] P5: `apiFetch`, `useBackendWake`, `BackendWakeNotice`, Workspace/Assistant wiring, pre-warm, tests
- [x] P6: `keepalive.yml`
- [x] P7: `SECURITY.md` linked from README
- [x] P8 local: README/HANDOFF, release evidence and full local checks
- [ ] P8 remote: 🛑 push/deploy approval, exact-commit hosted/CI checks, 🛑 tag `wave1` approval

Execution notes (October 20, 2026): implementation and local checks are recorded in HANDOFF. Windows reserves ports 5165–5264, including the default 5173, so ignored test adapters use port 5300 and the corresponding isolated fixture origin; checked-in backend files are unchanged. A Workspace reload assertion now waits for the lazy route heading before testing wallet visibility; no asserted strings or persistence checks were removed. Final review additionally bounds repeated automatic wake/refetch incidents. Keep-alive windows are the intended UTC dates from this plan; organizer deadline timezone and actual Render workspace usage still need confirmation before remote activation. Push, hosted CI/deployment checks and tag approval remain separate pending release steps.
