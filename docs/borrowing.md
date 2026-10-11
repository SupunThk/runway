# Read-only Mezo testnet borrowing

Runway reads the selected account's existing Mezo position. It never submits borrowing, refinancing, collateral withdrawals, repayments or liquidation transactions. A connected wallet is selected automatically; anyone can also enter a public address. Wallet MUSD and Runway schedule balances are not used to infer borrowing debt.

## Deployment and source verification

The integration uses the official [Mezo MUSD repository](https://github.com/mezo-org/musd/tree/aa25fd6defbe6c1385940e183ea7a0a3df4533d8/solidity), pinned at `aa25fd6defbe6c1385940e183ea7a0a3df4533d8`. Addresses and ABI signatures came from its [matsnet deployment artifacts](https://github.com/mezo-org/musd/tree/aa25fd6defbe6c1385940e183ea7a0a3df4533d8/solidity/artifacts/deployments/matsnet), whose chain ID is 31611.

| Component | Verified testnet address |
| --- | --- |
| TroveManager proxy | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` |
| TroveManager implementation | `0x9aAB567966983e95536FC460C12266FB0Cc10B07` |
| PriceFeed proxy | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` |
| PriceFeed implementation | `0xec42B37C12b8D73d320f4075A1BCd58B306629c1` |
| Native BTC/USD oracle | `0x7b7c000000000000000000000000000000000015` |
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |

Read-only RPC inspection verified code presence, EIP-1967 implementation slots, the manager's MUSD and price-feed bindings, and the feed's oracle binding. Proxy upgrades cause the relevant reads to fail validation until the integration is reverified. This is integration verification, not an independent audit or full bytecode/source verification.

## Accounting

All reads for one position use one block number. [TroveManager](https://github.com/mezo-org/musd/blob/aa25fd6defbe6c1385940e183ea7a0a3df4533d8/solidity/contracts/TroveManager.sol) supplies:

- `getTroveStatus`: nonexistent, active, closed by owner, closed by liquidation or closed by redemption. Inactive positions do not display a fabricated zero-debt loan or infinite collateral ratio.
- `getEntireDebtAndColl`: collateral, principal and interest totals, followed by their pending redistribution components. The first three already include those pending components. Debt is principal plus interest; pending amounts must not be added again. Interest includes virtual accrual at the source block.
- `getTroveInterestRate`: the position's fixed annual rate, in basis points; 100 bps displays as 1%.
- `MCR` and `MUSD_GAS_COMPENSATION`: the current individual liquidation threshold and protocol gas reserve. The observed values were 110% and 200 MUSD. Debt includes the protocol reserve and is not a repayment quote.

The frontend reconciles its collateral/debt ratio with `getCurrentICR` before showing loan health. It keeps values as bigint and formats the exact 18-decimal BTC/MUSD amounts. Percentages display four decimal places, truncated. The annual rate comes directly from the protocol; Runway does not compound or estimate future interest.

## Price and freshness

[PriceFeed](https://github.com/mezo-org/musd/blob/aa25fd6defbe6c1385940e183ea7a0a3df4533d8/solidity/contracts/PriceFeed.sol) supplies the protocol price. The reader checks the native oracle's decimals, positive answer and timestamp, requires an update no older than 60 seconds relative to the source block, and verifies that scaled oracle data equals the protocol's price. The deployed native oracle reports `answeredInRound = 0`; that field is not treated as a Chainlink round-completeness check.

Price failures retain verified collateral/debt/interest while marking loan health unknown. An RPC refresh failure labels cached data as a previous snapshot and hides its health. The UI also withholds health when the displayed snapshot ages beyond its freshness window or the chain head is stale relative to the browser clock. Every successful view shows its source block, UTC chain time and oracle update time. Above-threshold collateralization is a dated observation, not a safety guarantee.

## Hypothetical BTC price stress

The simulator is deployed and only appears for active positions with a verified, fresh protocol price. Its slider models whole-percentage drops from 0% to 100%; a table compares 0%, 10%, 20%, 30% and 50% drops. Changing accounts resets the slider. Invalid/stale prices and failed refreshes hide all scenarios.

Calculations use bigint throughout: scenario price = snapshot price × (100 − drop) / 100; ratio = collateral × scenario price / total debt. The estimated threshold price is debt × minimum ratio / collateral, rounded upward to the next 18-decimal unit. USD prices display rounded upward to cents and ratios truncate to four percentage decimals; threshold classification uses full precision before formatting and distinguishes equality.

Debt and collateral are held fixed at the displayed source block, including already accrued interest, redistribution and the gas reserve. Future interest, repayments, redistribution and system-wide liquidation conditions are not modelled. Scenarios are hypothetical price-only estimates, not liquidation predictions or repayment quotes. No additional RPC requests or wallet actions are needed to move the slider.

## Verification and operation

`node scripts/inspect-borrowing.mjs` uses the same reader as the UI, defaults to the existing founder and contractor accounts, and writes `deployments/mezo-testnet.borrowing.check.json`. Node 24+ is required to import the TypeScript reader. Optional public address arguments replace the defaults.

The recorded founder snapshot has an active position with 0.035 BTC collateral, 1% fixed annual interest and approximately 2001.835 MUSD total protocol debt. The contractor snapshot has no position. These are historical testnet observations, not current balances or repayment instructions. The report retains exact amounts and source blocks.

Unit and browser tests cover interest-inclusive debt, redistribution accounting, oracle decimals/freshness, active and closed positions, absent positions, wrong network/token, unsupported upgrades, failed refreshes and below-threshold ratios. Signing tests remain simulated; these borrowing reads required no new wallet transactions.
