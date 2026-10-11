# Mezo Runway

Fully funded MUSD contractor payments on Mezo testnet. A sender deposits the entire amount, entitlement accrues linearly, and claims transfer earned MUSD to an immutable recipient. Cancellation refunds unvested funds and preserves earned entitlement.

**Status:** Live Mezo testnet payments with verified full-payment and cancellation journeys, transaction history, JSON receipts, CSV export and pending-transaction recovery. A verified read-only borrowing view is implemented locally; it has not yet been deployed. Implementation began October 10, before the brief's October 16 build start; organizer approval remains unconfirmed.

## Run locally

Use Node 24 and pnpm 10.34.6:

```powershell
npm exec --yes --package=pnpm@10.34.6 -- pnpm install --frozen-lockfile
Copy-Item .env.example .env
npm exec --yes --package=pnpm@10.34.6 -- pnpm dev
```

When pnpm is already installed, run `pnpm dev` directly. Open the URL printed by Vite. Install/unlock Rabby, MetaMask, or another EVM browser wallet. Click **Connect wallet**, choose the detected wallet, and switch to Mezo testnet. Use dedicated test wallets only.

Vite loads public configuration from the root `.env`. The example includes verified testnet MUSD and RunwayPayments addresses. The payment deployment is recorded in `deployments/mezo-testnet.payments.json`. Blank or invalid configuration keeps payments disabled. Never put private keys in a `VITE_` variable.

## Checks

```text
pnpm typecheck
pnpm test
pnpm test:browser
pnpm build
pnpm test:contracts
pnpm verify:integration
```

The native Foundry wrapper works without WSL. Its first run downloads Solidity 0.8.28. Contract dependencies are pinned to OpenZeppelin 5.0.2 and compile for the London EVM target. `contracts/out/RunwayPayments.sol/RunwayPayments.json` contains the compiled artifact after testing/building.

## Workflow

After testnet deployment is recorded, set `VITE_PAYMENT_CONTRACT_ADDRESS`, restart Vite, connect the founder, enter recipient/amount/duration, approve exact MUSD funding and create the schedule. Starts use chain time with a two-minute signing buffer after approval. Share `/schedules/<id>` with the contractor. Claims always pay the stored recipient, regardless of caller.

The sender may cancel before the end. Already claimed funds are never refunded. Remaining vested funds can still be claimed after cancellation. All addresses, amounts and timing are public.

## Deployment and remaining work

To deploy through a browser wallet without exporting keys, run `pnpm deploy:browser` and open `http://127.0.0.1:5174`. The root `.env` must contain `FOUNDER_ADDRESS`. The tool checks the selected founder, Mezo testnet chain, official MUSD bytecode and estimated gas before enabling deployment. Approve the creation transaction in your wallet, then share the resulting contract address and transaction hash for verification and application configuration. Do not deploy again if a submitted transaction is still pending.

The frontend is live at [mezo-runway-testnet.vercel.app](https://mezo-runway-testnet.vercel.app), using the existing testnet contract. The existing Vercel project is connected to [SupunThk/runway](https://github.com/SupunThk/runway): pushes to `main` trigger production builds. `vercel.json` configures the source build and recipient-route fallback; public testnet environment settings are configured in Vercel. A fallback static build can be prepared with `pnpm prepare:hosting`; see [hosting instructions](docs/frontend-hosting.md). Contract deployment requires a funded test wallet and a local signing method; do not commit credentials.

See [Wave 1 checklist](wave1Steps.md), [integration evidence](docs/integration-verification.md), [product scope](docs/product-scope.md), and [buildathon readiness](docs/buildathon.md).

The borrowing view reads an existing testnet loan for a connected wallet or an entered public address. It shows protocol collateral, interest-inclusive debt, the fixed annual rate, and dated loan health only when price checks pass. Borrowing and repayments open in Mezo. See [borrowing integration](docs/borrowing.md); `node scripts/inspect-borrowing.mjs` records read-only evidence using the same reader.

Remaining release work includes publishing the local borrowing view, price-stress scenarios, complete schedule pagination and adversarial/stateful invariant coverage. The current source is a testnet prototype and has not received independent security review.

OpenZeppelin utilities are MIT-licensed; preserve their notices. No MUSD protocol implementation code has been copied. Other dependency licenses are supplied in their packages.
