# Mezo borrowing runtime fixture

`mezo-borrowing-runtime.json` contains gzip/base64-encoded public implementation bytecode read on chain 31611 at the recorded block. Source revision: `mezo-org/musd@aa25fd6defbe6c1385940e183ea7a0a3df4533d8`; the relevant protocol source files declare MIT SPDX identifiers. This is deployed runtime evidence, not copied Solidity implementation source or a replacement deployment.

The fixture covers BorrowerOperations, HintHelpers, SortedTroves, InterestRateManager and GovernableVariables. Unit and browser sources decompress it and return the real code so the production runtime-hash checks execute unmodified. Contract state, balances and wallet responses in those tests are synthetic; a matching runtime fixture does not establish current chain state or real signed execution.

The corresponding addresses and hashes are in `deployments/mezo-testnet.borrowing-write-verification.json` and `packages/mezo/src/borrowing-write-config.ts`. Regenerating this fixture requires separately checked public RPC reads; never replace expected hashes with mock hashes to bypass identity validation.
