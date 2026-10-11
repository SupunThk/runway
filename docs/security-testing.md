# Payment contract security tests

The October 11, 2026 local suite passes 24 Solidity tests: 9 original tests, 12 new adversarial tests, two stateful invariants and one deterministic handler exercise. The original accounting fuzz test runs 256 cases. Each invariant runs 128 sequences of 128 handler calls (16,384 calls), with zero unexpected handler reverts or discards. Results and per-selector metrics are recorded in `deployments/security-tests.check.json`.

## Adversarial cases

`contracts/test/RunwaySecurity.t.sol` covers:

| Case | Property checked |
| --- | --- |
| Short/fee funding and false ERC-20 returns | Funding reverts atomically; balances, count, obligations and discovery stay consistent; failed creation does not consume an ID. |
| False/reverting claim and refund transfers | Claimed amounts, cancellation flags, frozen entitlement, obligations and balances roll back; retry succeeds once the token recovers. |
| Reentrancy during token transfers | All nine outer/inner combinations of create, claim and cancel reject callbacks with the reentrancy-guard error. Outer operations preserve escrow accounting. |
| Claims by unrelated callers | MUSD goes only to the immutable recipient; unrelated callers cannot cancel. |
| Claim/cancel ordering | Both orders produce the same final recipient payment and sender refund; cancellation freezes accrual. |
| Direct token donations | Donations remain surplus and cannot be claimed or refunded as schedule entitlement. |
| No-return ERC-20 transfers | Successful legacy token calls complete funding, refund and claim through SafeERC20. |
| Large amounts | Vesting succeeds when the intermediate multiplication exceeds uint256; full-precision settlement conserves the funded amount. |
| Invalid constructor/recipient/IDs | Invalid operations revert without changing schedule accounting. |
| Contract pagination boundary | 105 schedules discover correctly across the 100-ID limit; zero limits and exhausted offsets return empty pages. |

## Independent stateful model

`contracts/test/RunwayInvariant.t.sol` targets six handler actions: create, advance time, permissionless claim, sender cancellation, unauthorized cancellation and donation. Three funded actors can be both senders and recipients, including self-payments. The campaign supports up to 32 schedules with varied starts, durations and integer amounts. Three initial schedules prevent empty-system invariants. A deterministic handler exercise explicitly executes successful claims, cancellation and final settlement.

The handler records expected immutable fields, paid/refunded amounts and frozen cancellation entitlement independently of contract getters. Its bounded reference model uses simple integer multiplication/division, separate from the contract's full-precision Math.mulDiv implementation. The invariants check:

- Every schedule matches its model, paid amounts never exceed earned entitlement, and `claimable` equals independently calculated unpaid earnings.
- Outstanding obligations equal the sum of all remaining commitments, including future unvested commitments.
- Escrow token balance equals obligations plus direct donations.
- Every actor's token balance matches deposits, refunds, payouts and donations; all actor/escrow balances conserve total minted supply.
- Sender and recipient discovery indexes match the complete model exactly and unauthorized actors receive no payment.

At the end of each invariant run, the [Foundry `afterInvariant` hook](https://getfoundry.sh/forge/invariant-testing?highlight=invariant) advances through all schedule ends and settles every remaining entitlement through an unrelated caller. It then checks zero obligations, escrow equal to donations only, and the model/balance/discovery invariants again. Target contracts/selectors follow Foundry's invariant interface without introducing a forge-std dependency.

`fail_on_revert = true` is enabled. Expected protocol errors are caught and checked by exact selector inside the handler; unexpected handler failures fail the campaign rather than being silently ignored.

## Run

```powershell
node scripts/forge.mjs test --root contracts
node scripts/forge.mjs test --root contracts --match-contract RunwaySecurityTest
node scripts/forge.mjs test --root contracts --match-contract RunwayInvariantTest
```

CI already runs the full suite through `pnpm test:contracts`. Configuration is in `contracts/foundry.toml`; it adds invariant execution settings without changing production compiler settings.

The final test run also checked that the production source SHA-256 and creation-bytecode hash still match the original deployed and explorer-verified artifact. No production contract source, frontend behavior or deployed contract changed, and no blockchain transactions were sent.

## Scope

This is local adversarial and bounded model-based testing, not an independent audit or exhaustive proof. The stateful model uses a standard ERC-20; unusual transfer behavior is covered by specific mocks. It does not validate every property of the external MUSD implementation, arbitrary rebasing/outgoing-fee tokens, RPC/provider behavior or real wallet extension signing. Donations intentionally remain escrow surplus: the deployed contract has no administrative sweep. Remaining release work includes demo/submission materials, release review and the previously documented external confirmations.
