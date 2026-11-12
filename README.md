# Mezo Runway

Fund contractor payments upfront in MUSD on Mezo testnet, or send direct one-time MUSD transfers. Contractors earn scheduled allocations linearly over time and claim them to their wallet; founders and teams can manage invoices, approval quorums, payroll runs, client payment links, public funding proofs, and Mezo borrowing coverage.

**[Open the live app](https://mezo-runway-testnet.vercel.app) · [User guide](docs/user-guide.md) · [Live documentation](https://mezo-runway-testnet.vercel.app/docs) · [Security](SECURITY.md)**

**Status:** Wave 2 is deployed and live in production as of **November 12, 2026** (`https://mezo-runway-testnet.vercel.app` and `https://runway-api-rw61.onrender.com`). Scheduled and one-time payments, team workspaces, approval quorums, payroll runs, recurring plans, dated cash forecasts, client `/pay/<token>` links, public `/proof/<address>` escrow verification, `/admin` operational metrics, and the Wave 2 Ask Runway assistant are live. This is a **testnet prototype with no independent security audit**. Use dedicated test wallets and testnet assets only.

## What you can do

| Feature | Available today |
| --- | --- |
| Contractor payments | Deposit the full MUSD amount into a linear schedule (minutes, hours, or days up to 365 days) or send a direct one-time MUSD transfer. Cancel schedules at any time before end with unvested funds refunded to the sender. |
| Payment tracking & proof | Browse sent/received schedules with pagination, inspect history, download JSON receipts and CSV exports, recover pending transactions, and verify any sender's onchain escrow commitments at `/proof/<address>` without logging in. |
| Team workspace & approvals | Sign in with an EOA or ERC-1271 contract wallet, invite team members (`manager`, `approver`, `viewer`, `contractor`), collect private contractor invoice submissions, enforce versioned approval quorums, and execute owner-signed payroll runs. |
| Recurring plans & forecasts | Prepare idempotent weekly/monthly recurring invoice occurrences, model dated cash forecasts with repayment reserves and optional revenue assumptions, enable opt-in in-app reminders, and export formula-safe CSV reports and private audit logs. |
| Client payment links | Create public `/pay/<token>` checkout links in Workspace; payers connect on Mezo testnet and settle via verified direct MUSD transfers with 12-block confirmation tracking and crash recovery. |
| Borrowing & Runway planner | Read an existing Mezo loan, review protocol-aware borrowing/collateral/repayment quotes, save Borrow → Fund payment plans across reloads, and stress-test payroll coverage against hypothetical BTC price drops. |
| Ask Runway | Ask product and Mezo questions across 24 reviewed knowledge sections with validated source citations and deep links to app workflows. |
| Admin reliability metrics | Wallet-authenticated `/admin` dashboard displaying aggregate workspace activity, indexed escrow totals, request/error/latency metrics, and reconciliation freshness without exposing private user records. |

## Try the payment flow

1. Open the [app](https://mezo-runway-testnet.vercel.app), connect an installed EVM wallet and use **Wallet setup** to select Mezo testnet. The sender needs testnet MUSD for funding and BTC for gas; importing MUSD only adds its display to the wallet.
2. Create a schedule (`Payment over time`) or direct transfer (`One-time payment`) with a recipient and amount. For schedules, approve the exact MUSD funding amount if needed, then confirm schedule creation in the wallet. Starts use chain time with a two-minute signing buffer after approval.
3. Share `/schedules/<id>` with the contractor (or `/proof/<sender-address>` for a public escrow summary). Anyone may trigger a claim, but MUSD always goes to the stored recipient.
4. The sender may cancel a schedule before the end. Cancellation returns only unvested funds; already claimed funds stay paid, and earned but unclaimed funds remain claimable.

Funding a schedule is distinct from paying the recipient: payment occurs when MUSD is claimed. Schedule addresses, amounts and timing are public. Workspace business records are private to the owner and accepted team roles; contractors see only their own submissions. Linked onchain payments remain public.

You can read the [documentation](https://mezo-runway-testnet.vercel.app/docs), inspect [public funding proofs](https://mezo-runway-testnet.vercel.app/proof), and view individual schedule pages without connecting a wallet. The guide includes [manual network setup](https://mezo-runway-testnet.vercel.app/docs#manual-network-setup), [MUSD import](https://mezo-runway-testnet.vercel.app/docs#manual-musd-import) and a Markdown download.

## Architecture

| Layer | Implementation |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, wagmi and viem; hosted on Vercel. Wallets authorize blockchain transactions. |
| Payments | Solidity `RunwayPayments` on Mezo testnet (`0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D`); MUSD settlement, BTC gas. Separate `RunwayMilestones` contract prepared and tested offline. |
| API and workspace | Hono on Node.js, hosted on Render, with MongoDB Atlas for workspaces, team roles, approval quorums, payroll runs, payment requests, wallet-login sessions and usage counters. Vercel proxies `/api` to Render. |
| Reconciliation | Read-only payment indexer and direct-transfer verifier in the Render API process; confirmed chain snapshots (12-block buffer) supply invoice and payment-link settlement evidence. |
| Assistant | Server-side Gemini through the AI SDK, using 24 reviewed public knowledge sections, coverage guards, and validated source links. Provider credentials stay on the server. |

The payment contract has no owner/admin, upgrade or arbitrary withdrawal function. MUSD has separate privileged roles that can affect escrow balances; see the [trust assumptions](SECURITY.md#trust-assumptions).

## Run locally

**Isolated Wave 2 local runner:** `node scripts/dev-local.mjs` starts an isolated frontend and API with a temporary MongoDB instance at `http://127.0.0.1:5300` (or set `RUNWAY_LOCAL_PORT=5301`). It uses public `.env.example` settings and does not load `.env`. It reads an optional ignored `.runway-local.json` (`{"version":1,"adminWallet":"YOUR_PUBLIC_0x_ADDRESS"}`) or `--admin-wallet YOUR_PUBLIC_0x_ADDRESS` for `/admin` access. See [local build details](docs/wave2-local-build.md) and the [admin dashboard guide](docs/admin-dashboard.md).

Use **Node.js 24** and **pnpm 10.34.6**. The npm wrapper below works when pnpm is not installed globally.

```powershell
git clone https://github.com/SupunThk/runway.git
cd runway
npm exec --yes --package=pnpm@10.34.6 -- pnpm install --frozen-lockfile
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

The root `.env.example` includes the public testnet contract settings. In your local `.env`, configure `MONGODB_URI` for Workspace and `GEMINI_API_KEY` for Assistant. Follow [backend setup](docs/backend.md) for database access, exact-origin settings and optional indexing. Keep database and provider credentials server-side; never commit `.env` or put secrets in `VITE_*` variables.

```powershell
npm exec --yes --package=pnpm@10.34.6 -- pnpm dev
```

This starts **both the API and Vite**. Open the URL printed by Vite, normally `http://127.0.0.1:5173`, and keep `APP_ORIGIN` equal to that origin for wallet login and API mutations.

## Checks and verification

With pnpm installed, run these from the repository root; otherwise prefix each command with `npm exec --yes --package=pnpm@10.34.6 --` (or invoke the local binaries directly via `node`).

```text
pnpm typecheck
pnpm test
pnpm test:browser:local
pnpm build
pnpm test:contracts
pnpm format:check
pnpm check:health
```

The Wave 2 release passes **174 unit/API/frontend tests across 23 files, 119 browser cases, and 39 Foundry smart contract tests** (plus 1 optional live RPC fork test via `pnpm test:fork`), along with TypeScript, production build, formatting, and live Render/Vercel health checks.

The Solidity suite covers both `RunwayPayments` (24 tests) and `RunwayMilestones` (15 tests), including adversarial token/reentrancy tests, 256-run fuzz suites, and **four independent stateful invariant campaigns (128 runs × 128 calls = 16,384 calls each, 0 unexpected reverts)**. [Testing details](docs/security-testing.md) and [explorer verification](docs/explorer-verification.md) describe the evidence and its limits. Source verification and passing tests do not constitute an audit.

## Deployments

| Component | Mezo testnet deployment |
| --- | --- |
| Network | Chain ID `31611`; BTC is the gas currency. |
| RunwayPayments | [`0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D`](https://explorer.test.mezo.org/address/0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D?tab=contract), exact-match source verified. |
| MUSD | [`0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`](https://explorer.test.mezo.org/address/0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503?tab=contract), 18 decimals. |
| MEZO | [`0x7B7c000000000000000000000000000000000001`](https://explorer.test.mezo.org/address/0x7B7c000000000000000000000000000000000001), 18 decimals. |

Contract details are in [the deployment manifest](deployments/mezo-testnet.payments.json). Pushes to `main` trigger Vercel production builds. Render follows the `deploy/render-backend-2026-10-13` branch. See [frontend hosting](docs/frontend-hosting.md), [Render hosting](docs/render-hosting.md) and [reconciliation operations](docs/payment-reconciliation.md).

## Limits and remaining work

- **Borrowing writes are opt-in.** Production borrowing, collateral and repayment writes on `/borrowing` require `VITE_RUNWAY_BORROWING_ENABLED=true` on the deployment; otherwise loan execution opens in the external Mezo interface. Planner months are 30 days and price scenarios are hypothetical.
- **Milestone escrow awaits user-signed deployment.** `RunwayMilestones.sol` and its offline verification artifacts are complete and tested; app/proof integration is gated on a user-signed testnet deployment (`node scripts/deploy-browser.mjs --contract milestones --founder <address>`).
- **Free hosting can sleep.** Backend wake-up and indexer catch-up can delay Workspace, Assistant and payment evidence after inactivity, though the GitHub keep-alive workflow pings `/api/health` during judging windows.
- **Assistant scope is documentation only.** Ask Runway explains product and Mezo concepts from 24 reviewed knowledge sections; it does not inspect live wallets, private workspace records, or submit transactions.

## Documentation and source

- [Documentation index](docs/README.md): guides, design, planning notes and submission assets.
- [High-level app overview](docs/app-high-level.md): product journeys, system architecture and data boundaries, with diagrams.
- [Low-level app design](docs/app-low-level.md): source map, contract accounting, API, database and request flows, with diagrams.
- [User guide](docs/user-guide.md): setup, payments, workspace, team operations, planner, proof, pay links and troubleshooting.
