# Wave 2 demo and release preparation — November 4, 2026

This is a recording/release worksheet, not a claim that a demo was recorded, a release occurred, participants completed tasks or a submission was sent. All current improvements remain local and uncommitted. See [the handoff](HANDOFF.md), [implementation status](wave2-remaining-work.md) and [pilot runbook](pilot-runbook.md).

## Local demo sequence

The new isolated preview uses port **5301**; the earlier port-5300 instance may still hold its original demo data. Check listening processes before starting another instance. Set `RUNWAY_LOCAL_PORT=5301`, then use `node scripts/dev-local.mjs`. This runner uses public example settings and temporary MongoDB, disables dotenv and assistant inference, and reads the user-designated admin wallet from ignored local settings. Never load `.env` for this demonstration. Data is discarded on shutdown. Only the user signs with an installed wallet; automated regressions use generated fixture wallets.

1. Open a workspace, save a contractor and invite a separate reviewer wallet. Show that an unaccepted invitation grants no workspace access. Accept it as that wallet.
2. As the registered contractor, submit an exact MUSD invoice. Show that other workspace records remain unavailable. Review immutable recipient, amount, due date and payment type.
3. Set a satisfiable approval quorum. Approve with distinct authorized wallets. Demonstrate that revocation or a policy change invalidates prior authority. Signing a login message is separate from signing a payment.
4. Prepare a payroll run of approved invoices. Review its exact total, run approvals and per-payment states. Follow one payment into the existing wallet-reviewed form, then demonstrate recovery without a second payment. Only separately authorized real transactions count as testnet evidence.
5. Prepare a recurring occurrence. Retry the same reviewed date and show the original invoice. Demonstrate a month-end transition, missed-date disclosure and pause/resume.
6. Enter a reviewed wallet-cash assumption and repayment reserve in the dated forecast. Add an expected receipt with its assumption toggle off, then on. Show shortfall dates and partial-source warnings; already funded escrow is excluded from future wallet debits.
7. Opt in to in-app reminders, refresh, and inspect due/missed items. Export the scoped CSV and inspect actor/action/outcome audit records. Explain that no push/email or automatic transaction service is running.
8. Show the existing Borrow → Fund recovery, client payment link and pinned public funding proof. Their November 3 regression evidence remains distinct from installed-wallet use and new team-operation tests.
9. Show the separate milestone contract and offline preparation report. Do not present a milestone deployment, app flow or combined proof as delivered before the gate below.

## Milestone deployment and integration gate

The [extension implementation plan](wave2-extensions-implementation-plan.md#phase-5--f2-manual-deployment-gate) says: **“Do not begin Phase 6 until this gate is satisfied.”** The user must deploy/sign through their wallet; the deployed address and receipt must then be verified before milestone app/invoice/proof integration. This user interaction cannot be replaced by a simulated test or a placeholder deployment manifest.

Prepared files: `contracts/src/RunwayMilestones.sol`, three new Foundry suites, `deployments/milestones-preparation.check.json` and `deployments/verification/RunwayMilestones.standard-input.json`. The existing payment source and manifest are unchanged.

```text
node scripts/forge.mjs build --root contracts
node scripts/prepare-milestones.mjs
node scripts/deploy-browser.mjs --contract milestones --founder <public-deployer-address>
```

The first two commands compile/prepare without keys or broadcasts. The last opens a localhost-only deployment page; select **RunwayMilestones**, confirm the intended public deployer and Mezo testnet, review gas, then use the user's wallet. It does not load `.env`. The deployer is not inferred from the local admin wallet. Never request or export a private key or recovery phrase. After broadcast, the page disables repeat deployment even if receipt polling fails; check the existing hash.

After the user supplies the actual deployment hash/address: verify successful canonical creation, constructor MUSD, creation/runtime hashes, source/compiler settings and confirmation evidence; only then create `deployments/mezo-testnet.milestones.json`. `node scripts/verify-explorer.mjs --milestones` supports read-only verification after that actual manifest exists; `--submit` publishes source and is a separate explicitly authorized action. No milestone manifest/address has been invented. The configured app and public proof remain schedule-only until the integration gate is complete.

## Release and submission checklist

- Confirm the actual submitted Wave 1 SHA and date; `b27b109` is the local base, not verified submission identity. Keep the deferred `wave1` tag uncreated.
- Record the final local test commands/counts and their limitations in the new evidence report; inspect the working-tree diff and preserve the user's planning files.
- Run installed-wallet cases from the pilot runbook, including contract-wallet login/authority changes and any supported multisig transaction path. Record independent sessions and actual participant feedback separately from internal simulations.
- Supply an actual dated cost record if operating costs are to be shown. Testnet payment volume, loan proceeds and escrow funding are not fee revenue.
- Record the demo, capture screenshots, confirm team/contact metadata and prepare an honest Wave 1-to-2 changelog. Do not claim a recorded video or independent user traction from this worksheet.
- Obtain explicit release authorization. Coordinate the backend first, including conflict-checked settlement backfill and new indexes; review any conflicts rather than overwriting records. Configure hosted admin access separately and preserve the frontend API proxy. The user chose to skip current hosted inspection.
- Release the frontend only after compatible backend readiness. Validate hosted cookies/origin/rate limits and direct route loads/reloads in the authorized release session. New borrowing writes remain production opt-in.
- Submit only after actual submission requirements, URLs, release identity and evidence are verified. No commit, push, tag, deployment or submission is performed by this worksheet.

## Changelog scope

Core local increment: direct protocol writes and recovery; persistent Borrow → Fund plans; protocol-aware planning/reserves; client payment requests; public pinned schedule funding proof; private admin reliability metrics.

November 4 local increment: accepted wallet roles and revocation; contractor invoice submissions; policy-versioned reviews and payroll-run approval checks before signing/linking; exact payroll totals with confirmation-derived progress; idempotent weekly/monthly recurrence; dated cash assumptions and risk disclosure; opt-in in-app reminders; formula-safe scoped CSV and audit records; explicit ERC-1271 login and session revalidation; separate milestone contract and deployment preparation.

Unfinished evidence/integration: user-signed milestone deployment and app/proof integration, installed-wallet validation, independent pilots, recorded demo, released build and actual submission. Billing/fee collection and atomic borrowing/payment routing remain gated later expansions.
