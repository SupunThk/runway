# RunwayPayments explorer source verification

The existing Mezo testnet payment contract is [verified with an exact source match](https://explorer.test.mezo.org/address/0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D?tab=contract). Blockscout confirmed verification at `2026-10-11T04:46:08.009609Z`. Its API reports `is_verified: true`, `is_fully_verified: true`, and `is_partially_verified: false`. The public browser page displays **Contract Source Code Verified (Exact Match)**, source files, ABI, compiler settings and decoded constructor arguments.

## Matched deployment

- Chain: 31611, Mezo testnet.
- Contract: `src/RunwayPayments.sol:RunwayPayments` at `0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D`.
- Creation: `0xdb151ec249a704f17390ba6b35ef5458924deff142a796995c60773c3a80f45f`, block 16083735, original founder.
- Compiler: `0.8.28+commit.7893614a`, London EVM, optimizer enabled with 200 runs, viaIR disabled, IPFS metadata.
- Constructor MUSD: `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`.
- Source SHA-256: `39a68162565adcdce8fc653d509e0d7db1474cb733cac2b6bc2c33dbd0252323`.

`scripts/verify-explorer.mjs` checks every standard-input source against the original artifact metadata, original main-source hash and creation-bytecode hash. It checks the explorer-indexed creation input/result/founder/block and current RPC deployed-bytecode hash. The RPC returned no receipt for the old creation during this session; the original receipt was verified at deployment, and current creation checks used Blockscout's indexed transaction. This does not require redeploying or signing.

The source bundle includes RunwayPayments plus six OpenZeppelin 5.0.2 dependencies, with their SPDX notices preserved. Before publication, unauthenticated GitHub reads confirmed all seven files exactly matched publicly accessible sources. Evidence and public source URLs are in `deployments/verification/public-source-check.json`. The official OpenZeppelin MIT license is retained as `deployments/verification/OpenZeppelin.LICENSE`. Blockscout's separate license metadata field defaults to `none`; the Solidity source files retain their MIT SPDX declarations.

## Reproduce or inspect

```powershell
# Check sources, deployment and current explorer status; no submission.
node scripts/verify-explorer.mjs

# Publish matching public source if needed, then wait for explorer confirmation.
node scripts/verify-explorer.mjs --submit
```

The script uses the existing native Foundry wrapper and the [Blockscout per-instance verification API](https://docs.blockscout.com/devs/verification/foundry-verification), which requires no API key. The configured Mezo explorer API host is `https://api.explorer.test.mezo.org`; the frontend host itself does not serve the verification API.

The saved standard compiler input is `deployments/verification/RunwayPayments.standard-input.json`; API/bytecode evidence is `deployments/mezo-testnet.explorer.check.json`. The successful submission GUID was `01a1662f2eb6c15bfb2c8fd010c53c9055478b7d6acb148b`. No new blockchain transactions were created. Exact source matching is not a security audit; stronger adversarial/stateful contract tests remain a separate next step.
