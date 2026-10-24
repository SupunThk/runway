# Runway demo video: recording plan and speech script

**Target length:** about 4 minutes 30 seconds. Speak at roughly 120–135 words per minute, leaving short pauses for clicks and readable screens. The timestamps are editing targets; rehearse once and adjust to your pace. Check the submission platform's actual video limit before recording.

**Goal:** show the problem, explain the payment model, prove it with existing testnet transactions, then show Workspace, planning and Ask Runway.

**Live app:** <https://mezo-runway-testnet.vercel.app>

## 1. Prepare before recording

1. Record at 1920 × 1080 in landscape. Keep text readable; use browser zoom if necessary. Enable microphone recording, silence notifications and close unrelated tabs. Make a ten-second test clip to check voice clarity and screen readability.
2. Use a dedicated test wallet. Connect it to Mezo testnet, then sign in to Workspace before the main take. Do not show recovery phrases, private keys, passwords, `.env`, provider dashboards or browser autofill.
3. Open Overview, Workspace, Borrowing and Assistant once. Allow the backend to wake and invoice indexing to catch up. API health alone does not prove reconciliation is current. Wait for loading to finish before recording a settled screen.
4. Prepare these tabs in order:
   - [Overview](https://mezo-runway-testnet.vercel.app/).
   - [New schedule](https://mezo-runway-testnet.vercel.app/?create=1).
   - [Completed payment: schedule 1](https://mezo-runway-testnet.vercel.app/schedules/1).
   - [Cancelled payment: schedule 2](https://mezo-runway-testnet.vercel.app/schedules/2).
   - [Workspace](https://mezo-runway-testnet.vercel.app/workspace).
   - [Borrowing and planner](https://mezo-runway-testnet.vercel.app/borrowing).
   - [Assistant](https://mezo-runway-testnet.vercel.app/assistant).
   - [Documentation](https://mezo-runway-testnet.vercel.app/docs).
5. Use existing demo contractors/invoices if available. Choose a record that contains no sensitive business information. If no suitable record exists, create a clearly named demo workspace, contractor and draft invoice manually before recording. This writes business records only; it does not fund a payment. Do not claim the invoice is paid unless confirmed evidence actually says so.
6. Open both historical schedule pages and confirm the displayed results before using their figures below. The checked repository evidence is dated October 10, 2026: [schedule 1](../deployments/schedule-1.check.json) and [schedule 2](../deployments/schedule-2.check.json). If current reads fail, use a clearly labelled recorded evidence view rather than calling it live.
7. Keep [the explainer image](assets/runway-submission-overview.png) and [the large icon](assets/runway-app-icon.png) ready for opening and closing frames. These are submission graphics, not app screenshots.

**This walkthrough needs no new blockchain transactions.** Show the funding form, then use completed testnet schedules as settlement evidence. If you have genuine earlier transaction footage, insert it with a “Recorded testnet transaction” caption. Do not stage a wallet confirmation or present a form preview as a completed payment.

## 2. Video sequence at a glance

| Time      | Scene                                     | Main screen                        |
| --------- | ----------------------------------------- | ---------------------------------- |
| 0:00–0:15 | The problem and product                   | Icon/title, then Overview          |
| 0:15–0:40 | How the payment model works               | Explainer image                    |
| 0:40–1:15 | Prepare a payment                         | New schedule form and wallet setup |
| 1:15–1:45 | Prove completed settlement                | Schedule 1 and history             |
| 1:45–2:15 | Explain cancellation                      | Schedule 2 and history             |
| 2:15–2:50 | Organize work and verify payment evidence | Workspace                          |
| 2:50–3:25 | Plan payroll and inspect borrowing        | Borrowing and planner              |
| 3:25–3:55 | Ask a product question                    | Assistant answer and citations     |
| 3:55–4:15 | Show self-service help                    | Documentation and manual setup     |
| 4:15–4:30 | Close with the value and link             | Overview or closing card           |

## 3. Scene-by-scene speech script

Read only the blockquoted narration aloud. Screen directions and captions are production notes.

### Scene 1 — Opening: 0:00–0:15

**Screen:** show the app icon and “Mezo Runway” for two seconds, then cut to Overview. Keep the testnet badge visible.

**Say:**

> Paying a contractor should make it clear what is committed, what is earned, and what has actually been received. Runway brings those steps together in a payment workspace on Mezo testnet.

**Caption:** “Mezo Runway · MUSD contractor payments”.

### Scene 2 — The model: 0:15–0:40

**Screen:** show `runway-submission-overview.png`. Slowly point to Fund, Accrue and Claim, then the cancellation return arrow.

**Say:**

> The founder deposits the full payment amount in MUSD. A smart contract holds it while the contractor earns their allocation over time. The contractor claims earned funds to the recipient wallet saved in the schedule. If the founder cancels early, only unvested funds return. Earned funds remain claimable. BTC is used for transaction gas.

**Caption:** “Fund → Accrue → Claim”.

### Scene 3 — Prepare a payment: 0:40–1:15

**Screen:** open New schedule. Show Wallet setup briefly, then enter a known demo recipient, `1` MUSD and a short duration accepted by the form. Stop before sending a transaction. Highlight recipient, total and duration in that order.

**Say:**

> Here I choose the contractor's address, the total amount and the duration. Wallet setup helps add or switch to Mezo testnet and request MUSD token import. Importing the token does not fund the wallet. When I submit a payment, Runway requests an exact token approval if needed, followed by a separate schedule-creation transaction. Both require wallet confirmation. For this walkthrough, I will use existing completed testnet payments to show the results.

**Caption:** “Form preview · No new transaction submitted”.

**Recording note:** if wallet setup is already complete, show the manual details briefly. A login signature and a token-import request are different from a payment transaction; do not describe them as funding.

### Scene 4 — Completed payment: 1:15–1:45

**Screen:** switch to `/schedules/1`. Show the total, claimed amount and available claim amount. Open or scroll to transaction history. Briefly point to a confirmed claim and its explorer link. If useful, show receipt/CSV controls without spending time in a file picker.

**Say:**

> This is a real completed testnet schedule. One MUSD was funded and the recipient claimed the full amount across multiple transactions. Funding and payment are different events: the recipient is paid when a claim transfers MUSD. The schedule records the terms, and transaction history provides the supporting evidence. Runway also offers JSON receipts and CSV export for review.

**Caption:** “Historical testnet payment · Schedule #1 · 1 MUSD fully claimed”.

### Scene 5 — Cancellation: 1:45–2:15

**Screen:** open `/schedules/2`. Show cancelled status, claimed total, the cancellation event and the claim after cancellation. Use rounded amounts in captions; the UI and receipts retain exact units.

**Say:**

> The second testnet schedule demonstrates cancellation. It was funded with one MUSD. About zero point six two eight three MUSD was earned, while about zero point three seven one seven was refunded. The recipient claimed the rest of their earned entitlement after cancellation. Cancelling did not take back money already paid or erase what the contractor had earned.

**Caption:** “Historical cancellation · ~0.6283 MUSD earned · ~0.3717 MUSD refunded”.

**Recording note:** this schedule is already settled. Explain its history; do not imply a Cancel or Claim action is still available now.

### Scene 6 — Workspace and evidence: 2:15–2:50

**Screen:** open the prepared Workspace. Show a contractor and draft invoice. Point to payment evidence if available. Open the invoice's payment form, show the prefilled values, then return without funding.

**Say:**

> Workspace adds the business context around a payment. I sign a wallet message to access my private records, save contractors, and prepare invoices. An invoice opens a payment form with the recipient and amount already filled in. The backend matches confirmed chain evidence to invoices and distinguishes funded, partially claimed, paid and cancelled. If the indexer is behind, the app reports that evidence is unavailable rather than presenting it as current.

**Caption:** “Private business records · Public onchain payments”.

**If no invoice has linked payment evidence, say this instead of the last two sentences:**

> This invoice is still a draft. Once a matching schedule is confirmed and indexed, Runway can display its payment evidence. A draft invoice is not proof that the contractor has been paid.

### Scene 7 — Borrowing and planning: 2:50–3:25

**Screen:** open Borrowing. Show the source block/time, position and full planner. If a verified, fresh active loan exists, move the BTC price-drop slider once. Show an actual coverage result only when current schedules and freshness checks permit it.

**Say:**

> The planner separates funds already committed in escrow from MUSD still in the wallet. It estimates how long current payroll can continue, assuming streams are renewed at unchanged rates. The borrowing view reads an existing Mezo loan and lets me explore hypothetical BTC price drops. Those estimates are separate from guaranteed cash coverage. Borrowing and repayment open in Mezo; Runway does not execute loans or treat wallet MUSD as loan debt.

**Caption:** “Read-only borrowing · Hypothetical scenarios”.

**If there are no active schedules, replace the first two sentences with:**

> This wallet currently has no active outgoing streams, so the planner does not invent a payroll coverage number. With current streams, it estimates coverage from escrow and wallet MUSD, assuming renewal at unchanged rates.

**If the price or loan data is unavailable:** show the real state and explain, “Runway withholds these scenarios when the price cannot be verified.” Do not substitute invented balances or suggest an old snapshot is current.

### Scene 8 — Ask Runway: 3:25–3:55

**Screen:** ask: **“What is the difference between funded and paid?”** Show the returned explanation and its source links. Leave enough time to read the first paragraph. Open one citation if it adds clarity.

**Say:**

> Ask Runway helps a user understand the product without leaving the workspace. I am asking about the difference between funded and paid. Answers use reviewed Runway and Mezo knowledge, with supporting source links. This Assistant explains the application; it cannot inspect live wallets or private invoices, and it cannot sign or send transactions.

**Caption:** “Reviewed knowledge · Source links · No transaction tools”.

**Recording note:** ask during rehearsal to check availability, then record one final request. If the answer takes time, trim the wait and use a “Response wait shortened” caption. If inference is unavailable, show the actual message and a clearly labelled earlier answer recording, or cut to Documentation. Never fabricate an Assistant response.

### Scene 9 — Help and onboarding: 3:55–4:15

**Screen:** open Documentation, scroll to manual network setup and MUSD import, then point to Download guide.

**Say:**

> The public guide covers setup, funding, claims, cancellation and troubleshooting. It includes manual network and token-import instructions, and users can download the same guide. These pages are available without connecting a wallet, so onboarding does not depend on signing in first.

**Caption:** “Wallet-free documentation · Downloadable guide”.

### Scene 10 — Closing: 4:15–4:30

**Screen:** use Overview or a simple closing card with the icon, product name and live URL. Keep the URL visible for the final few seconds.

**Say:**

> Runway connects committed funding, earned entitlement and verifiable payment evidence in one workspace. The working prototype is live on Mezo testnet. It is not audited, and it is intended for testnet use only. Try it at the link on screen.

**Closing text:**

```text
Mezo Runway
Fund once. Claim as you earn.
mezo-runway-testnet.vercel.app
Testnet prototype · Not audited
```

## 4. How to record and edit

1. **Record the screen in short scenes.** Capture each scene with a few extra seconds before and after the action. Position the cursor deliberately and avoid rapid scrolling. Record the real UI state, including relevant source times and status labels.
2. **Record the voice separately if that is easier.** Read only the speech blocks. Use a quiet room, keep microphone distance consistent and pause between scenes. Pronounce “Mezo” naturally and say “M-U-S-D” and “B-T-C” consistently. Say “zero point…” for the small cancellation amounts rather than reading every decimal.
3. **Match narration to visible evidence.** Show the funded amount when saying funded, the claimed amount when saying paid, and the cancellation event when explaining the refund. Keep transitions simple.
4. **Shorten waiting, not meaning.** Trim backend wake-up, page loads, signature waiting and model waiting. Label shortened waits or historical inserts. Never splice separate operations together to imply a transaction that did not happen.
5. **Add accurate subtitles.** Check token symbols, amounts and feature names manually. Keep subtitles clear of buttons, amounts and status notices. Music is optional; keep it low enough that the voice is easy to understand.
6. **Export an MP4 in landscape.** Use H.264 video and AAC audio where available, at 1080p and 30 fps. Name it `runway-demo.mp4`. Upload using the submission platform's permitted method, then test playback and access from a signed-out browser.

## 5. If the submission limit is three minutes

Use the same story with this tighter edit. Shorten the narration to match the selected actions; do not speed up the voice until it is hard to follow.

| Time      | Keep                                                                    |
| --------- | ----------------------------------------------------------------------- |
| 0:00–0:20 | One-sentence introduction and the Fund → Accrue → Claim graphic.        |
| 0:20–0:45 | Payment form, exact approval if needed, separate creation confirmation. |
| 0:45–1:15 | Schedule 1 settlement and schedule 2 cancellation evidence.             |
| 1:15–1:45 | Workspace invoice and prefilled funding flow.                           |
| 1:45–2:15 | Planner and read-only borrowing boundary.                               |
| 2:15–2:40 | One Assistant question and source links.                                |
| 2:40–3:00 | Brief guide view, testnet disclosure and live link.                     |

## 6. Final review before submitting

- Can a first-time viewer explain where the funds are held and when the contractor receives them?
- Are form previews, historical transactions and current reads labelled accurately?
- Does the video distinguish funded, earned and claimed amounts?
- Are borrowing scenarios described as hypothetical and loan management as external to Runway?
- Are the Assistant's documentation-only limits clear?
- Are all shown records appropriate for public viewing, with no credentials or unrelated private information visible?
- Are voice, subtitles, amounts and the live link readable at normal playback size?
- Does the uploaded video fit the confirmed time/file limits and play without requiring the reviewer's access request?

For a deeper explanation, link reviewers to the [high-level overview](app-high-level.md), [low-level design](app-low-level.md) and [README](../README.md).
