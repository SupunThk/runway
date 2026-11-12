# Runway admin dashboard

## November 3 local improvements

The isolated runner now supports the ignored `.runway-local.json` file. The user-designated public admin wallet has been saved there; it is not embedded in frontend code, committed or added to hosted settings. Start `node scripts/dev-local.mjs`, then connect that wallet and sign the login message on `/admin`. The flag `--admin-wallet` still overrides local settings. Empty or invalid configuration never grants access.

Service health now includes observed server/client error counts, request totals, average latency and a p95 histogram upper bound in 24 UTC hour buckets. These are measured from bounded request categories, without URL tokens, addresses, bodies or session data. Admin refreshes and health probes are excluded. Requests unable to reach the database are logged as bounded, credential-free failure events but cannot be included reliably in durable counters; collection failures can undercount. Records retain 90 days and earlier history remains unavailable. Reconciliation check age is displayed separately from database readiness.

Operating cost remains unavailable until an actual dated record is supplied through server-only `RUNWAY_COST_RECORD_JSON`. Required fields: `kind: "actual"`, `amountUsd` as a decimal string, `periodStart`, `periodEnd`, `recordedAt` as ISO dates and a short `source` label. Future/invalid/forecast records are rejected. The UI discloses the source and period and labels older periods historical. This is an operator-provided expense record, not automatic provider metering. Revenue still says **Not collecting fees**.

The earlier implementation notes below describe the November 1 baseline; these updates supersede its uninstrumented-request and pending-local-configuration statements.

Implemented locally November 1, 2026. No deployment is part of this change.

Open `/admin` or `/admin/` on the local app, normally `http://127.0.0.1:5300/admin`. The dashboard is an internal, read-only page. Public navigation stays focused on the customer product; bookmark this address.

## Wallet login and access

Admin login reuses Runway's wallet-message authentication and revocable HTTP-only session. Connecting a wallet is not sufficient. Every `/api/admin/*` request must pass both session verification and a server-side wallet allowlist check. Ordinary signed-in workspace users receive 403; unsigned users receive 401. Requests are not cached, and admin reads are limited to 30 per wallet per minute. Session expiry, logout and removal from the configured allowlist revoke access. Admin permissions cannot be granted through a browser setting or header.

No admin address is selected automatically. Until an address is configured, access is denied to everyone. For isolated local development, stop the existing local process and run:

```text
node scripts/dev-local.mjs --admin-wallet YOUR_PUBLIC_0x_ADDRESS
```

Replace the placeholder with your designated public wallet address. Never provide a private key or recovery phrase. This uses a temporary MongoDB database and public example frontend settings, without loading `.env`. All records disappear when that process stops. The login message costs no gas and authorizes no blockchain transaction. No Google/Gmail login was added.

For a later reviewed release, configure server-only `RUNWAY_ADMIN_WALLETS` as comma-separated public wallet addresses. An empty, malformed or zero-address configuration fails closed. Never prefix this setting with `VITE_`. The page does not reveal the allowlist. This local task did not change any hosted environment or deploy the new routes.

## Metrics and their meanings

| Panel | Source and scope |
| --- | --- |
| Runway revenue | Explicitly says **Not collecting fees**. Billing is not implemented; gross, refunds and net revenue are unavailable rather than invented zeroes. Testnet receipts are not real revenue. |
| Workspaces and owner wallets | All-time counts from the connected environment's database. Wallets are not people or verified independent customers; internal tests are included. |
| Workspace activity | Distinct wallets making successful authenticated workspace requests in a selected 7/30/90-day UTC range. Returning means activity on at least two distinct days. |
| Daily activity | Observed wallet/day buckets and successful request counts. Dates before tracking began are **Not tracked**. These are request observations, not page views or completed financial actions. |
| Contractor and invoice counts | All-time record counts only, without private record contents. |
| Wave 2 team & checkout adoption | All-time aggregate counts for accepted team members, prepared payroll runs, active recurring plans, and client `/pay` payment links (total and linked). |
| Business model & projected run-rate | Displays the Solo (0 MUSD/mo, 0 bps) and Team Operations (49 MUSD/mo + 25 bps capped at 25 MUSD) fee schedule, monthly subscription equivalent, and 25 bps volume fee equivalent alongside the 100% Mezo Testnet pilot waiver (`0 MUSD` collected). |
| Payment activity | Exact bigint accounting from a fresh, published canonical schedule-index generation. Funding, recipient claims, sender refunds and remaining commitments are separate. This is contract-wide activity, independent of the date filter. |
| One-time invoice links | Number of invoice records with a linked direct transfer. This is not a live paid verdict or aggregate one-time payment volume. |
| Service health | The dashboard's successful database read, reconciliation availability, 24-hour API request/error/latency metrics broken down by service family (`workspace`, `payment-link`, `authentication`, `assistant`), and operator-supplied actual operating cost record (`RUNWAY_COST_RECORD_JSON`). |
| Snapshot export | One-click `Download JSON snapshot` button in the report toolbar for exporting the timestamped admin overview. |

Payment amounts are strings in MUSD base units in the API. Decimal formatting preserves 18 decimals. Stale, inconsistent or missing index data yields unavailable totals. Unpublished generations are excluded. A changed generation pointer invalidates the read. A maximum of 5,000 rows is aggregated; a larger generation is prominently labelled partial. Source block and check time are displayed. Database health alone does not prove index freshness or RPC uptime.

The dashboard does not query the chain for every invoice or infer revenue from borrowed MUSD or contractor funding. Actual fee receipts, refund accounting, provider/hosting costs, error-rate instrumentation and independent-user classification require later integrations with verified sources.

## Privacy and operational boundaries

Only aggregate metrics are returned. The overview API does not return contractor names, invoice descriptions, workspace names, wallet lists, signatures, session tokens or provider credentials. An admin cannot move funds, alter recipients, change contract rules, approve loans or modify customer records through this dashboard.

New server-side `workspaceActivity` records store a wallet, UTC day, first/last observation and successful request count, with 90-day TTL retention. `appMetrics` stores the tracking start date. Admin refreshes and failed/unauthenticated workspace requests are excluded. These operational records are not anonymous; they remain server-side and are not sent to the assistant or any analytics provider. Existing customer records are not backfilled into invented activity history. Collection failures can undercount observations; telemetry failures do not turn a successful workspace operation into a failed operation.

The browser hides metrics immediately when the selected wallet changes, access cannot be revalidated, a metrics refresh fails, or the user signs out. Cached aggregates are cleared on logout. Signing out also revokes the shared workspace session. A failed logout is reported rather than represented as a confirmed server-side revocation.

## Verification

API tests use temporary MongoDB and generated fixture-wallet message signatures. They cover anonymous/non-admin denial, forged-header rejection, fail-closed configuration, allowlist/session revocation, no-store headers, privacy, exact claim/refund math, stale and inconsistent evidence, partial aggregation, UTC activity, concurrent buckets and throttling.

Browser tests exercise wallet login through the real isolated API/database, reload, date filtering, unauthorized access, account switching, logout, failed-refresh hiding, rejected signatures and 320px layout. Screenshots are fixture data, not production usage or revenue. Existing financial and workspace regression assertions are preserved. No financial transaction or production database write is needed to test this dashboard.

Source: `apps/api/src/admin.ts`, `admin-metrics.ts`, `apps/web/src/Admin.tsx`, `AdminMetrics.tsx`. Local SPA routing and future hosting rewrite files include both admin URL forms; Netlify's existing catch-all already covers them.
