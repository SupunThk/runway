# Integration evidence

## Latest release and explorer verification — October 11, 2026

Schedule pagination was deployed from `5bfc3d9` as production deployment `dpl_H7pmgZy2eM5L922hodW5FoKyL5UQ`. Public HTTPS browser checks reconciled schedules 1/2 for founder and contractor at block 16095225, with complete coverage, no page errors, no mobile overflow and no new transactions. Borrowing and price-stress scenarios are also deployed.

The existing payment contract is now [source verified with an exact match](https://explorer.test.mezo.org/address/0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D?tab=contract). Blockscout confirmed full verification at `2026-10-11T04:46:08.009609Z`. All seven source files match the original artifact metadata and already-public GitHub sources. Compiler settings, constructor, indexed creation transaction and current RPC deployed bytecode were checked. The public explorer page was verified in a browser. Evidence and reproduction: [explorer verification](explorer-verification.md), [API report](../deployments/mezo-testnet.explorer.check.json). No new blockchain transactions were submitted. Earlier pending statements below describe historical stages.

## Latest borrowing verification — October 11, 2026

The read-only borrowing reader verifies the official testnet manager and price-feed proxy implementation slots, token/oracle bindings, deployed ABI signatures, accrued-interest and redistribution accounting, and protocol oracle freshness. Reads at a shared block reconcile the displayed collateral ratio with `getCurrentICR`. The founder has an active position; the contractor has none. Historical snapshots are in [borrowing check](../deployments/mezo-testnet.borrowing.check.json), and pinned primary source links and limitations are in [borrowing integration](borrowing.md). These checks required no new wallet transactions. The borrowing view and hypothetical price-stress simulator are deployed. Earlier pending statements below describe historical stages.

## Initial verification — October 10, 2026

The read-only verification command is `pnpm verify:integration`. Its machine-readable output is [integration-check.json](../deployments/integration-check.json).

On October 10, 2026, the public RPC returned chain ID 31611. At block 16082936, the candidate MUSD address `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` had 6437 bytes of bytecode and returned name `Mezo USD`, symbol `MUSD`, and decimals `18`.

The address came from the [official repository's matsnet deployment record](https://github.com/mezo-org/musd/blob/main/solidity/artifacts/deployments/matsnet/MUSD.json). Standard ERC-20 ABI methods come from viem. No protocol implementation source is reused. This verifies metadata and bytecode, not all token semantics or any payment transaction.

Pending:

- Funded founder and contractor public wallet addresses.
- A real MUSD transfer and its receipt.
- Deployment of RunwayPayments against official MUSD.
- Real schedule creation, claim, and cancellation receipts.
- Borrowing contracts, ABI versions, proxy details if applicable, debt accounting and oracle freshness.

The browser rechecks chain ID, MUSD metadata, bytecode and the payment contract's immutable token before enabling writes. No real transfers have been executed by this build session.

## Wallet readiness — October 10 follow-up

At block 16083659 on chain 31611:

| Role | Public address | BTC | MUSD |
|---|---|---|---|
| Founder | `0x1ac891Ce491851AC87851D62B9184c75A76f55cF` | `0.01399999991280333` | `1800` |
| Contractor | `0x99d7a7dcf20a0ac9fc3D03Cd90b0a1F4BC561b09` | `0.001` | `0` |

These public roles are configured in the local `.env`. Wallet funding readiness is verified. Payment deployment and creation/claim/cancellation receipts remain pending.

The local deployment page runs with `pnpm deploy:browser`. Its browser smoke check confirmed it loads without JavaScript errors and blocks both absent wallets and incorrect founder accounts. No deployment was broadcast during this verification.

## Confirmed payment deployment — October 10 follow-up

The founder subsequently deployed RunwayPayments at `0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D`, transaction `0xdb151ec249a704f17390ba6b35ef5458924deff142a796995c60773c3a80f45f`, block 16083735.

`scripts/verify-deployment.mjs` confirmed successful contract creation from the expected founder, exact creation input matching the local artifact and official MUSD constructor argument, deployed bytecode, and the immutable MUSD getter. At verification block 16083752, schedule count and outstanding obligations were both zero. The record, build/source hashes, compiler settings and deployment details are in `deployments/mezo-testnet.payments.json`.

The local `.env` and public example now reference this deployment. Explorer source-code verification has not been performed. Real schedule creation, claim and cancellation receipts remain pending.

## First real payment — schedule 1

At block 16083922, schedule 1 was funded with 1 MUSD by the configured founder for the configured contractor, accruing from October 10, 2026 13:11:13 UTC to 13:16:13 UTC. It was not cancelled.

- Creation: `0xfac8ba60aa596866f153789a7dd33c564c9c8495fdddfe86200470362d658303`.
- First claim: `0xd52fce720b4cf7192738354e6ccde5c9a8e8bf540cfa565ab0186e551460678f`, 0.19 MUSD.
- Second claim: `0xc6a6580303c5beb2834d4faa2d2933c25711da75fedaf5618ec4db14cc826421`, 0.27 MUSD.

The recipient's actual token balance and the schedule's cumulative claimed amount were both 0.46 MUSD. The contract held the remaining 0.54 MUSD. This verifies real funded creation and partial settlement; final settlement and cancellation testing remain pending. This read did not establish which account submitted the claim transactions.

Snapshot and confirmed events are in `deployments/schedule-1.check.json`. Rerun `node scripts/inspect-schedule.mjs 1` for current state. The command reads only and scans at most 10,000 blocks of events in bounded chunks.
