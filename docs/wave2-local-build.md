# Wave 2 local build

## November 3 improvements

The local app now saves owner/chain-scoped payment plans, preserves their original terms through borrowing and funding, verifies canonical receipts and compares reviewed debt with a later observed snapshot. Start in New payment → Save payment plan & review funding options. Borrowing remains separate from funding and is never repeated automatically.

Workspace includes client payment links; `/pay/<token>` accepts a reviewed exact MUSD transfer and retains the hash through verification/reload. Shared settlement claims prevent reuse across requests and invoices, including concurrent linking. `/proof/<address>` independently reads pinned schedule-only funding evidence without a backend or wallet. The planner now shares protocol fee/mode/capacity rules with loan review and can exclude a user-entered repayment reserve from usable wallet cash.

The user-designated admin wallet is configured in ignored local settings. Admin metrics now show observed request failures/latency and reconciliation age; costs require a dated actual record. `pnpm check:health` checks direct and proxied service readiness independently; `pnpm test:fork` runs isolated EVM execution with an authentic pinned native-oracle response and synthetic actor BTC. See [pilot validation](pilot-runbook.md) for its limits and the remaining installed-wallet/independent-user work. Nothing here changes hosting, deploys contracts or submits a real transaction.

The November 1 notes below are historical; statements about the old price-only planner and missing unified local intent are superseded by this increment.

November 1, 2026. Local implementation in progress; nothing in this increment is deployed.

## Run without production settings

From the repository root, with installed dependencies and Node 24:

```text
node scripts/dev-local.mjs
```

Open `http://127.0.0.1:5300/borrowing`, connect a dedicated testnet wallet and choose **Open loan controls**. The server uses public `.env.example` frontend values, disables Vite dotenv loading and starts a temporary MongoDB instance. Workspace records disappear when the process stops. It does not read the user's `.env` or use their Atlas database. The isolated database can require an initial MongoDB test-binary download. Assistant inference is not configured in this isolated environment.

This is a local application connected to the public Mezo testnet RPC. Real wallet confirmations would submit real testnet transactions. Automated verification uses fake wallet providers and deterministic RPC responses; the agent has not signed or broadcast a transaction.

To choose another local port, set `RUNWAY_LOCAL_PORT` for this command. The default 5300 avoids the previously reserved 5173 port. Existing `pnpm dev` remains the original configured development flow and loads `.env`; use `dev:local` for this isolated build instead.

## Implemented first slice

- Open a founder-owned Mezo trove, borrow additional MUSD, add BTC collateral, and partially repay MUSD through direct wallet calls.
- Read verified proxy identities, implementation runtime hashes and cross-contract bindings before preparing writes. Position, oracle, balances and protocol parameters share a pinned block.
- Quote issuance fees, fee exemptions, opening reserve, minimum net debt, Recovery Mode, individual/system collateral constraints and the stored per-trove capacity.
- Include virtual system interest exactly once. Existing position totals already include redistribution; those components are not added again.
- Review and simulate before offering a wallet transaction. Recheck current terms, account, chain, quote freshness and BTC gas budget before signing. A 0.01 MUSD debt-estimate tolerance is explicitly shown; it is an app check, not an onchain execution bound.
- Save transaction hash, exact calldata and BTC value; recover after reload, validate canonical receipts and wait for the 12-block application buffer. A manual check obtains a fresh chain head. Unknown status never signs again.
- Coordinate wallet prompts across tabs with Web Locks and block new payments while a loan transaction is unresolved. Browser storage is a recovery aid, not chain authority.
- After a confirmed borrowing/opening, acknowledge and open a prefilled schedule form. Schedule funding remains a separate wallet transaction with the existing contract and original sender ownership.

Loan controls are present in local development. Production builds default to no controls unless `VITE_RUNWAY_BORROWING_ENABLED=true` is deliberately supplied for a later reviewed release. No hosting setting has been changed. The existing planner's price-only scenario remains explicitly labelled with its original exclusions; the new loan-controls headroom is the protocol-aware quote.

## Evidence and limitations

Public identity inspection: [write verification](../deployments/mezo-testnet.borrowing-write-verification.json). The typed snapshot reader was also exercised successfully against real public testnet state. Read-only source/identity checks are not an audit or signed execution evidence.

The protocol source is pinned to `aa25fd6defbe6c1385940e183ea7a0a3df4533d8`. Its stored borrowing-capacity limit is checked independently of collateralization; collateral additions do not reset that stored limit. Repayment uses the protocol's caller-burn path and does not request an ERC-20 approval. No MUSD protocol implementation source was copied into the application.

Full closure, collateral withdrawals, refinancing, atomic borrow-to-escrow, a unified persistent payment intent, receivables, billing, funding proof and milestone escrow are not delivered by this first slice. Borrowing can succeed while a later funding step is rejected; the debt remains and minted MUSD stays in the founder's wallet. Fungible wallet balances do not prove that particular token units came from a given loan.

Hash tracking starts when the wallet returns a hash. Closing before that response, clearing storage or using another browser can lose the record. Replacements unknown to the app may need wallet/explorer inspection; manual removal requires a warning and does not cancel an onchain transaction. Real installed-wallet financial verification and isolated fork execution are still pending.

## Checks

```text
node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json
node node_modules/vitest/vitest.mjs run
node node_modules/@playwright/test/cli.js test --config playwright.local.config.ts
node scripts/local-web.mjs --build
node scripts/forge.mjs test --root contracts
```

The local browser configuration uses the isolated server on 5300, reuses it if already running, and passes its origin to temporary API fixtures. Vitest also explicitly disables dotenv loading. Existing assertions are preserved. The public-runtime fixture in `tests/fixtures` enables offline identity validation against the same bytecode hashes without weakening production checks.

Read a public address with the new typed reader, without dotenv or wallet access:

```text
node scripts/inspect-borrowing-writes.mjs <public-wallet-address>
```

No commit, push, tag, deployment, paid service, production record write or signed transaction is part of this local build.
