# Wave 2 remaining implementation — November 4, 2026

The user requested the remaining Wave 2 features after reviewing the incomplete backlog. Implement locally, preserving all previous work. No release, contract deployment, outreach or real financial transaction is authorized. Never load `.env`; use the isolated runners and public example values.

The story is: an owner invites colleagues and contractors; contractors submit invoices; authorized reviewers approve immutable payment terms; the owner reviews a payroll run and signs each payment; confirmed evidence drives progress; recurring plans prepare later invoices; dated cash forecasts, opt-in in-app reminders, reports and an audit trail support the team.

## Delivery checklist

- [x] Wallet-bound invitations, roles, revocation and server-side authorization.
- [x] Contractor submissions, independent review and configurable approval quorum.
- [x] Payroll runs with exact totals and evidence-derived per-payment progress.
- [x] Recurring plans with explicit, idempotent occurrence preparation and missed-date states.
- [x] Dated forecasting with repayment reserves, explicit revenue assumptions and incomplete-source disclosure.
- [x] Opt-in in-app reminders/risk notices, consolidated exports and private audit records.
- [x] ERC-1271 contract-wallet authentication, fail-closed RPC handling and test evidence; installed-wallet compatibility remains manual.
- [x] Separate immutable milestone contract, adversarial/fuzz/invariant coverage and deployment preparation.
- [ ] Milestone application/proof integration after its documented deployment gate.
- [x] Updated guide, security notes, demo/changelog worksheet and manual validation materials; no recorded demo/submission is claimed.
- [x] Final isolated verification and dated handoff/evidence.

Installed-wallet signing, independent participant sessions and a user-signed milestone deployment remain external evidence gates; simulated tests cannot complete them. Billing and atomic borrowing/payment routing remain later gated expansions. Offchain approvals govern Runway preparation and linking, not transactions a wallet initiates outside the app. Reminders run when the workspace is opened/refreshed; no email, push delivery or background transaction service is implied.

## Baseline

HEAD: `b27b109c52b963f1f38d7f0cbca89b285e2d0226`, uncommitted working tree retained. Initial status saved in ignored `.tools/wave2-start-status.txt`. The previous evidence recorded 152 tests, 116 browser cases and 24 offline contract cases. Fresh checks and final results will be recorded below. The installed package binaries are used directly because pnpm is not on PATH and its npm cache entry is unavailable.

The fresh baseline passed **152 tests in 20 files** and API/web TypeScript before edits. The original payment contract and deployment manifest remain unchanged. No tests were removed or weakened. The existing payment-confirmation fixture now supplies the newly required invoice approval response; an additional case verifies that a failed approval check requests no wallet transaction.

## Review the local result

The new isolated preview is `http://127.0.0.1:5301/workspace`, with `/admin` using the designated wallet from ignored local settings. It uses a new temporary MongoDB; the earlier port-5300 preview was left running to preserve its demo data. Check whether a process is still listening before starting another preview. Neither preview establishes hosted release status. For a new instance, set `RUNWAY_LOCAL_PORT=5301` and run `node scripts/dev-local.mjs`; do not use the older dotenv-loading startup command.

Business records remain private to accepted roles. Manager and approver are distinct roles; the owner alone opens financial payment plans and links evidence. A policy or membership revocation invalidates previous reviews. A later invitation cannot revive old votes. Payroll runs require their own approval, and an invoice can belong to only one run. Public payment links/proof remain independent of these private records.

The forecast balance and optional expected revenue are session-local assumptions. Recurrence projection is bounded and disclosed as partial if it cannot cover the range; reports show recent-invoice subtotals rather than inventing all-wallet totals. Reminders run only while the workspace is open. Audit records have a one-year retention window and distinguish started from completed/rejected actions.

## Required external gates

The [extension implementation plan](wave2-extensions-implementation-plan.md#phase-5--f2-manual-deployment-gate) explicitly says **“Do not begin Phase 6 until this gate is satisfied.”** `RunwayMilestones` therefore has no fabricated deployment manifest, configured app flow or combined proof. Its tested source, offline preparation report and standard JSON are ready for the user-signed deployment described in [the demo/release worksheet](wave2-demo-and-release.md). After the actual address/receipt is supplied and verified, milestone application/invoice/proof integration can proceed.

Real installed-wallet admin/financial/multisig validation, independent participant sessions, actual costs, a recorded demo, release and submission remain manual. Their preparation does not count as completion or traction. No commits, pushes, tags, deployments, real signed/broadcast transactions, outreach or private hosted inspection occurred.

## Verification — November 4

[Dated evidence](../deployments/wave2-operations-local.check.json): **172 unit/API/frontend tests in 23 files; all 119 browser cases; 39 offline contract tests; API/web TypeScript; public-example production build; offline deployment-page build; formatting and whitespace passed.** One optional RPC fork case was skipped offline; the prior November 3 fork result is separate historical evidence. Contract totals comprise the original 24 cases plus 15 milestone cases, including two new independent invariant campaigns. All four invariant campaigns ran 128 runs with 16,384 calls each; fuzz cases use 256 runs.

The full browser suite passed before the final contractor-directory revocation guard; both team-operation browser stories and the complete 172-test unit/API suite passed again after that guard. The mobile 320px overflow assertion passed and its screenshot was reviewed. The deployment page builds with public fixture settings, without wallet connection or broadcast. [Milestone preparation](../deployments/milestones-preparation.check.json) validates source/compiler correspondence and generates standard JSON without creating a deployment manifest. The final bundle scan found no designated admin address; ignored local admin configuration is preserved.

Commands used the installed binaries directly: `node node_modules/vitest/vitest.mjs run`, `node node_modules/@playwright/test/cli.js test --config playwright.local.config.ts`, `node scripts/forge.mjs test --root contracts`, `node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json` and the web equivalent, `node scripts/local-web.mjs --build`, `node scripts/prepare-milestones.mjs`, and Prettier checks over the existing source/test scope. The ignored `.tools/build-deployment-ui.mjs` performed the offline deployment-page build. `git diff --check` and the unchanged original payment-source/manifest check passed.
