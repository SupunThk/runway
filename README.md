# Mezo Runway

Fund contractor payments upfront in MUSD on Mezo testnet. Contractors earn their allocation over time and claim it to their wallet; founders can track payment evidence and plan how long their funds will last.

**[Open the live app](https://mezo-runway-testnet.vercel.app) · [User guide](docs/user-guide.md) · [Live documentation](https://mezo-runway-testnet.vercel.app/docs) · [Security](SECURITY.md)**

**Status:** Wave 1 polish was deployed on October 20, 2026. Payments, workspaces, invoice reconciliation, Ask Runway and the runway planner are live. This is a **testnet prototype with no independent security audit**. Use dedicated test wallets and testnet assets only.

## What you can do

| Feature | Available today |
| --- | --- |
| Contractor payments | Deposit the full MUSD amount, accrue entitlement linearly, claim earned funds, and cancel with unvested funds refunded to the sender. |
| Payment tracking | Browse sent/received schedules with pagination, inspect history, download JSON receipts and CSV exports, and recover pending transactions. |
| Private workspace | Sign in with a wallet, save contractors, create draft invoices and open a prefilled funding form. |
| Invoice reconciliation | Match confirmed schedules to invoices and distinguish funding, partial claims, full payment and cancellation. Stale or unavailable evidence is disclosed. |
| Borrowing and planning | Read an existing Mezo loan, explore hypothetical BTC price drops, and estimate current payroll coverage from escrow and wallet MUSD. Borrowing and repayment open in Mezo. |
| Ask Runway | Ask product and Mezo questions with supporting source links. The assistant uses reviewed public knowledge; it has no live wallet, workspace or transaction tools. |
| Wallet setup | Select an installed EVM wallet, add/switch Mezo testnet, request MUSD import, or follow the manual setup guide. View BTC gas reserves and an optional MEZO balance. |

## Try the payment flow

1. Open the [app](https://mezo-runway-testnet.vercel.app), connect an installed EVM wallet and use **Wallet setup** to select Mezo testnet. The sender needs testnet MUSD for funding and BTC for gas; importing MUSD only adds its display to the wallet.
2. Create a schedule with a recipient, amount and duration. Approve the exact MUSD funding amount, then confirm schedule creation in the wallet. Starts use chain time with a two-minute signing buffer after approval.
3. Share `/schedules/<id>` with the contractor. Anyone may trigger a claim, but MUSD always goes to the stored recipient.
4. The sender may cancel before the end. Cancellation returns only unvested funds; already claimed funds stay paid, and earned but unclaimed funds remain claimable.

Funding a schedule is distinct from paying the recipient: payment occurs when MUSD is claimed. Schedule addresses, amounts and timing are public. Workspace business records are owner-private, but linked onchain payments remain public.

You can read the [documentation](https://mezo-runway-testnet.vercel.app/docs) and individual schedule pages without connecting a wallet. The guide includes [manual network setup](https://mezo-runway-testnet.vercel.app/docs#manual-network-setup), [MUSD import](https://mezo-runway-testnet.vercel.app/docs#manual-musd-import) and a Markdown download.

## Architecture

| Layer | Implementation |
| --- | --- |
| Frontend | React, TypeScript, Vite, wagmi and viem; hosted on Vercel. Wallets authorize blockchain transactions. |
| Payments | Solidity `RunwayPayments` on Mezo testnet; MUSD settlement, BTC gas. Recipient and payment terms are immutable after creation. |
| API and workspace | Hono on Node.js, hosted on Render, with MongoDB Atlas for business records, wallet-login sessions and usage counters. Vercel proxies `/api` to Render. |
| Reconciliation | Read-only payment indexer in the Render API process; confirmed chain snapshots supply invoice payment evidence. |
| Assistant | Server-side Gemini through the AI SDK, using reviewed public knowledge and validated source links. Provider credentials stay on the server. |

The payment contract has no owner/admin, upgrade or arbitrary withdrawal function. MUSD has separate privileged roles that can affect escrow balances; see the [trust assumptions](SECURITY.md#trust-assumptions).

## Run locally

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

This starts **both the API and Vite**. Open the URL printed by Vite, normally `http://127.0.0.1:5173`, and keep `APP_ORIGIN` equal to that origin for wallet login and API mutations. Public schedule reads and payment transactions use chain RPC; Workspace and Assistant require their backend configuration.

If Windows reserves port 5173, choose an available port and update `APP_ORIGIN` to match. Run `pnpm dev:api` and `pnpm dev:web --port 5300` in separate terminals for port 5300. With no global pnpm, use the same npm wrapper as above. Starting only Vite leaves backend features unavailable. Browser tests also default to port 5173; use a matching local Playwright configuration if that port is reserved.

## Checks and verification

With pnpm installed, run these from the repository root; otherwise prefix each command with `npm exec --yes --package=pnpm@10.34.6 --`.

```text
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
pnpm build
pnpm test:contracts
pnpm format:check
```

The native Foundry wrapper works without WSL. Its first run downloads Solidity 0.8.28. Contract dependencies are pinned to OpenZeppelin 5.0.2 and compile for the London EVM target. `pnpm verify:integration` separately performs read-only live RPC checks and updates local evidence; it is not an offline test.

The October 20 release passed **66 unit/API/frontend tests, 81 local browser cases and 24 Foundry tests**, plus TypeScript, build and formatting checks. Hosted verification covered 32 simulated wallet/planner/backend-recovery cases and 18 route/width/reload checks. [GitHub CI passed for the released source](https://github.com/SupunThk/runway/actions/runs/39409245310). These are dated release results; browser wallet tests use simulated providers. Real installed-wallet setup and hosted login validation remain pending.

The Solidity suite includes adversarial token/reentrancy tests and two independent-model stateful invariant campaigns. [Testing details](docs/security-testing.md) and [explorer verification](docs/explorer-verification.md) describe the evidence and its limits. Source verification and passing tests do not constitute an audit.

## Deployments

| Component | Mezo testnet deployment |
| --- | --- |
| Network | Chain ID `31611`; BTC is the gas currency. |
| RunwayPayments | [`0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D`](https://explorer.test.mezo.org/address/0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D?tab=contract), exact-match source verified. |
| MUSD | [`0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`](https://explorer.test.mezo.org/address/0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503?tab=contract), 18 decimals. |

Contract details are in [the deployment manifest](deployments/mezo-testnet.payments.json). The app uses this existing deployment; a new contract is unnecessary for local development. For an intentional new testnet deployment, `pnpm deploy:browser` provides wallet-based signing without exporting keys; see [integration evidence](docs/integration-verification.md).

Pushes to `main` trigger Vercel production builds. Render follows the separate `deploy/render-backend-2026-10-13` branch, so a frontend push does not release backend changes. See [frontend hosting](docs/frontend-hosting.md), [Render hosting](docs/render-hosting.md) and [reconciliation operations](docs/payment-reconciliation.md) before coordinating releases.

## Limits and remaining work

- **Borrowing is read-only in Runway.** Planner months are 30 days, price scenarios are hypothetical, and borrowing-capacity estimates have exclusions described in [planner documentation](docs/borrowing.md#runway-planner).
- **Free hosting can sleep.** Backend wake-up and indexer catch-up can delay Workspace, Assistant and payment evidence. A healthy API alone does not establish reconciliation freshness.
- **Assistant scope is documentation only.** It cannot inspect balances, look up transactions or execute actions. Planner-specific assistant knowledge still needs a backend update. Live-data tools and reviewed action preparation are future phases.
- **Further work remains.** Installed-wallet validation, demo/submission materials and external confirmations are outstanding. Direct borrowing/repayment, Mezo Passport and team/payroll automation remain planned; see the [development roadmap](docs/development-workflow.md).
- **Buildathon eligibility is unconfirmed.** Implementation began October 10, before the brief's October 16 build start. Organizer approval and deadline timezone remain external checks; see [buildathon readiness](docs/buildathon.md).

## Documentation and source

- [Documentation index](docs/README.md): guides, design, planning notes and submission assets.
- [High-level app overview](docs/app-high-level.md): product journeys, system architecture and data boundaries, with diagrams.
- [Low-level app design](docs/app-low-level.md): source map, contract accounting, API, database and request flows, with diagrams.
- [User guide](docs/user-guide.md): setup, payments, workspace, planner and troubleshooting.
- [Payment contract](contracts/src/RunwayPayments.sol) and [security policy](SECURITY.md): settlement rules, threat model and vulnerability reporting.
- [Payment reconciliation](docs/payment-reconciliation.md): invoice matching, confirmations and indexer freshness.
- [Borrowing integration](docs/borrowing.md): protocol reads, oracle checks and planning assumptions.
- [Assistant knowledge](docs/assistant-knowledge.md): reviewed public content used by Ask Runway.
- [Wave 1 implementation evidence](deployments/wave1-polish.check.json): verification results and source checks.

Guide content lives in `apps/web/src/guide.ts`; run `pnpm docs:generate` after editing it to regenerate `docs/user-guide.md` and the in-app download.

OpenZeppelin utilities are MIT-licensed; preserve their notices. No MUSD protocol implementation code has been copied. Other dependency licenses are supplied in their packages.
