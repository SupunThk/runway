# Development workflow and revised scope

Updated October 13, 2026, following the user's approval to expand Wave 1 and use MongoDB.

## Current delivery

The established public release remains the payment app described in HANDOFF.md. The local backend increment adds:

- TypeScript/Hono API with MongoDB persistence, pooled connections and automatic indexes.
- Domain-bound, five-minute, single-use wallet login challenges; one-day revocable HTTP-only cookie sessions.
- Owner-private workspaces and a contractor directory, with duplicate-wallet prevention per workspace.
- Owner-created draft invoices, exact MUSD base units and due dates.
- A `/workspace` page and prefilled payment forms from contractors/invoices.
- Bounded cursor pagination, input/body validation, origin checks and database-backed write/auth throttling.

This is a backend foundation. It does not implement contractor-submitted invoices, shared team access, invoice settlement, an indexer, reminders or protocol writes. The deployed Solidity payment rules remain the authority for funds. Names and invoice descriptions stay offchain.

## Expanded Wave 1 backlog

1. Configure the user's MongoDB database and verify persistence with the new UI.
2. Investigate historical GitHub browser-test failure 38117460629; run current regression checks before publishing.
3. Add verified event indexing and contractor/invoice-to-schedule reconciliation, with checkpointing, retries and reorg recovery.
4. Integrate direct wallet-signed borrowing and repayment after verifying official ABI, minimum debt, reserves, fees, position ownership, transaction simulation and actual debt changes. Keep funding separate.
5. Add repayment reserves, dated cash planning and protocol-mode/stale-price handling.
6. Integrate and test Mezo Passport, including authentication compatibility.
7. Publish reusable schedule helpers and an example; conduct three target-user walkthroughs.
8. Finish real hosted-wallet validation, updated demo/submission materials, external confirmations and release review.

## Wave 2 backlog

Payroll runs; recurring payment management; contractor invoice submission and approval; treasury forecasting; team roles and multisig; notifications and consolidated reports. Delivery dates need replanning around the expanded scope; original calendar entries are historical planning assumptions.

## Local workflow

1. Preserve the existing root `.env`. Add the backend settings documented in [backend setup](backend.md).
2. Run `pnpm install --frozen-lockfile` after pulling dependency changes.
3. Run `pnpm dev` to start API port 3001 and Vite port 5173. The browser uses same-origin `/api` requests through Vite's proxy.
4. Connect a personal EVM wallet on Mezo testnet and open `/workspace`. Sign the login message; create a workspace, save a contractor and prepare a draft invoice.
5. Open a prefilled funding form and review its recipient/amount. Funding still requires explicit wallet transactions.
6. Run `pnpm typecheck`, `pnpm test`, `pnpm test:browser`, `pnpm build` and `pnpm format:check` for this increment. Contract checks are required if contract code changes.

API integration tests use a temporary local MongoDB process, independent of the user's `.env` and database. The first test run downloads a MongoDB test binary. Browser tests use simulated wallets; real extension signing and the user's database require follow-up validation.

## Release workflow

Review the diff and verification evidence, configure server-only environment values for the chosen environment, and verify API readiness and the full workspace workflow before promoting a release. Main pushes still trigger Vercel production builds without waiting for GitHub CI. Do not push this increment until its environment and release checks are ready.

The selected hosting arrangement is now Render for the Node API, Vercel for the frontend and Atlas for MongoDB. The Vercel function adapter was removed. `render.yaml` prepares the service; `scripts/configure-api-proxy.mjs` adds the external `/api` rewrite after the real Render URL is assigned. See [Render hosting](render-hosting.md). Network access, proxy headers and production cookie/origin behavior require hosted validation; a local Vite build alone does not verify those boundaries.
