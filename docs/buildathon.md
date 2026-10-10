# Buildathon readiness

## October 10, 2026

The supplied brief lists October 16–26 as Wave 1 and a deadline time of 15:00 without a timezone. The AKINDO page did not expose its detailed rules or countdown to the text browser.

The user requested implementation now. Early work is recorded rather than described as work completed during the event. Permission to start early and eligibility remain unconfirmed.

Pending organizer/account checks:

- Registration and Discord participation.
- Deadline timezone and verified UTC/Asia/Colombo equivalents.
- Whether early implementation is accepted or must be treated as a pre-existing baseline.
- Required submission fields and terms.

Do not infer any of these are complete from the existence of the application.

## Local toolchain

- Node v24.16.0; npm 11.13.0; Git 2.54.0.windows.1.
- pnpm 10.34.6 is invoked through `npm exec --yes --package=pnpm@10.34.6 -- pnpm` when pnpm is not installed globally.
- WSL distribution enumeration returned `E_ACCESSDENIED`.
- Native Foundry is supplied by the official `@foundry-rs/forge` npm package. Its Unix-style postinstall is disabled; the package's platform-aware Node launcher resolves the Windows binary directly.
- Solidity 0.8.28, optimizer 200, EVM London, based on [Mezo environment configuration](https://mezo.org/docs/developers/getting-started/configure-environment/).
