# Independent pilot and installed-wallet validation

Prepared November 3, 2026 for the local improvements. This is a runnable test protocol, not evidence of completed users, revenue or signed transactions. No participant has been contacted automatically.

## Prepare a session

### Additional November 4 team-operation cases

Use the new isolated preview at `http://127.0.0.1:5301/workspace` if it is still running, or set `RUNWAY_LOCAL_PORT=5301` before starting the isolated runner. Its database is separate from the earlier port-5300 preview. Record new results rather than treating the automated cases as participant evidence.

- Owner invites a separate wallet; it has no workspace access before acceptance. Test manager preparation, approver review, viewer denial of writes and owner-only financial controls.
- A registered contractor submits an invoice and cannot read other records or approve their own submission. An invited contractor must accept first; revocation blocks new submissions, even while their directory record exists. Their own prior submissions remain accessible.
- Review with a two-wallet quorum. Change policy or revoke/reinvite an approver and demonstrate that earlier votes do not authorize new preparation. Reject an invoice and verify no transaction prompt opens.
- Group approved invoices into a payroll run, approve the run, review exact totals and fund each separately only if explicitly authorized. Reload between payments and compare evidence-derived per-row progress. Never use a manual paid flag as financial evidence.
- Prepare a recurring occurrence twice using the same reviewed date; observe one invoice. Test month-end dates, missed dates, pause/resume and interruption after invoice creation.
- Enter cash/reserve assumptions and toggle dated expected receipts. Check already funded escrow/received cash are not counted again. Record partial-source disclosures and projected shortfalls.
- Opt in to reminders per wallet/workspace. Confirm another wallet's preferences are separate, inspect private audit outcomes and export a scoped formula-safe CSV. Do not expect notification delivery while the app is closed.
- For an installed multisig, connect its actual contract account, generate the dedicated login message, obtain the wallet's full approved signature and verify it through ERC-1271. Test changed signing authority and unavailable RPC. Record the wallet/connector/version and each actually supported transaction type; generic API tests do not establish installed-wallet compatibility. Keep signatures out of notes/recordings.
- Milestone app/proof tasks begin only after the user-signed deployment gate and subsequent integration are complete. Until then, inspect contract test/preparation evidence without recording a deployed feature.

Use the isolated local application (`node scripts/dev-local.mjs`) and dedicated testnet wallets. The local database is disposable; export the session notes before stopping it. A deployed pilot requires a separately authorized release. Keep wallet keys, recovery phrases, login signatures and cookies out of recordings and notes. Ask for consent before recording; use a participant code rather than a name or email in the results.

Recruit at least three independent founders/operators and two contractor participants through outreach you send yourself. Record whether a participant is a team member, independent participant, assisted tester or independent completer. Wallet counts alone do not establish independent users. Pricing interviews can happen without charging anyone.

## Founder task

Give this scenario without demonstrating the interface first: “You hold BTC and need to fund a contractor in MUSD. Prepare and complete the payment, then share evidence with the contractor.”

1. Connect an installed wallet and select Mezo testnet. Verify the displayed address and network. Record time and any assistance.
2. Prepare a schedule with an agreed recipient, exact MUSD amount and period. Save the payment plan. Check that the saved recipient and duration survive reload.
3. If borrowing is needed, review the funding gap, fees, debt and collateral impact. A subminimum opening must explain why it is ineligible; never silently increase it. Only the wallet owner signs real testnet transactions.
4. Reject one wallet prompt. Resume the same plan. After borrowing, reload and confirm that it says “Borrowed; payment not yet funded” and that the app does not borrow again.
5. Acknowledge the confirmed loan receipt, compare reviewed debt with the later observed snapshot, then approve and fund the original terms. Rejecting funding must preserve the successful loan and allowance evidence.
6. After the 12-block buffer, open the recipient link and public proof page. Record transaction hashes, source blocks and exact amounts. Confirm the proof contains no private workspace information.
7. Reserve an amount for repayment in the planner. Explain, in the participant's own words, the difference between usable wallet cash, escrow commitments, hypothetical borrowing and debt.

## Contractor task

Open the recipient link in another installed wallet. Identify the immutable recipient, amount, accrual period and cancellation terms. Check the public proof without signing in. The wallet owner may claim earned MUSD; verify the actual recipient balance change and receipt. Record whether the contractor understands that funds accrue before a claim transfers them.

## Client and repayment task

Create a client payment link from Workspace. Explain which business name and memo are public and which fields are private. A second wallet pays the exact amount. Reload while confirmation is pending; there must be one transfer prompt, one stored hash and no automatic resend. The owner checks the receipt and opens the repayment prefill. Repayment always requires a new review and wallet signature; receiving client funds never repays automatically.

## Installed-wallet failure matrix

Record pass/fail/blocked and receipt evidence for each case. Do not mark a simulated provider as an installed-wallet result.

| Case | Expected result |
| --- | --- |
| Wrong chain or account change during review | Signing blocked; terms reviewed again |
| Rejected login or transaction prompt | No new authorization/transfer; retry remains available |
| Insufficient MUSD or BTC gas budget | Specific reason before signing |
| Reload after loan, approval or funding hash | Same hash checked; no duplicate borrowing or funding |
| RPC/database failure during verification | Saved evidence retained; no instruction to pay again |
| Expired request | New transfer disabled; qualifying pre-expiry receipt can be recovered |
| Reused transfer on another invoice/request | Exactly one settlement owner; conflict disclosed |
| Stale/reorganized proof snapshot | Unavailable/partial state; no complete live-funding assertion |
| Admin login with designated wallet | Read-only metrics; ordinary wallet denied |
| 320px screen and keyboard-only navigation | No overflow; inputs, disclosures and recovery actions usable |

The isolated protocol fork command is `pnpm test:fork`. It executes the deployed EVM contracts in a temporary local project, uses a synthetic BTC balance, and replays the native oracle's authentic response from that exact source block because Forge does not implement Mezo's native precompiles. Its report discloses these assumptions. It is separate from real-wallet and live-oracle execution evidence.

## Session results template

Copy this section per participant; leave unobserved values unavailable.

- Participant code / role / relationship to team:
- Date, app source revision and environment:
- Installed wallet and browser (versions):
- Recording consent and retention agreement:
- Task start / end / completion time:
- Completed independently, completed with assistance, abandoned or blocked:
- Steps requiring help and exact confusion observed:
- Prompt count and duplicate submissions (expected zero):
- Receipt hashes, source blocks and exact balance/debt changes:
- Critical failure or misunderstanding:
- Answer to “What would you use this for again?”:
- Answer to “What would stop you from using it?”:
- Optional pricing feedback, clearly distinguished from a purchase:
- Follow-up date and observed return use, if any:
- Proposed fix and evidence supporting its priority:

## Success criteria and reporting

Report independent completion rate, median completion time, assistance rate, failed/rejected prompts, duplicate submissions, correct explanation of debt versus cash, and observed return use. Keep assisted and internal sessions separate. Target at least three independent founder walkthroughs and two successful independent recipient claims, with no duplicate financial submissions. These are targets until observed. Testnet transfers, loans and escrow funding are not fee revenue or proof of willingness to pay.

## Outreach draft for the operator

“I’m testing Runway, a testnet tool for BTC-backed contractor payments. Would you be willing to try a short founder or contractor task and tell me where it is confusing? Participation is optional; we will use testnet assets, and I will never ask for keys or a recovery phrase. With your consent, I’d record task completion and usability notes.”

Send and schedule this yourself after choosing participants. No outreach or financial action is part of the automated implementation.
