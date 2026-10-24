# Submission image assets

The submission PNG files are saved in `docs/assets/` for submission uploads.

| File | Dimensions | Suggested use |
| --- | --- | --- |
| [runway-submission-overview.png](assets/runway-submission-overview.png) | 1672 × 941 | Project explanation / submission gallery. |
| [runway-app-icon.png](assets/runway-app-icon.png) | 2048 × 2048 | Large app icon / project avatar. |

The overview is an explanatory graphic, not an application screenshot. It describes the implemented testnet payment flow and supporting features. It retains the testnet and audit disclosures.

The icon is a deterministic browser-rendered export of the existing lowercase `r` / rounded outline branding, with optical centering. It uses mint `#9FC4B2` on charcoal `#202225` and the app's sans-serif fallback. No app code or deployed branding was changed.

## Creation method

- Overview: built-in image-generation tool; visually checked for text, flow and supported features.
- Icon: existing code-native branding exported to PNG with headless Chromium. No image-generation model was needed for this export.

## Final overview prompt

```text
Use case: infographic-diagram. Create a polished landscape submission infographic for the existing app Mezo Runway. Wide 16:9 canvas, ideally 2560x1440 or larger. Editorial fintech visual design. Background #F7F7F8, charcoal #202225 type, forest green #31745A accents, pale green #EDF4F0, mint #9FC4B2. Geist-like contemporary sans typography. Large readable text, ample white space, precise line icons, refined flat vector-style rendering. No photographs, no fake screenshots, no fake balances, no neon, no gradients, no 3D coins, no ornamental graphs. This must explain how the real app works clearly to hackathon reviewers.

Layout: top-left wordmark "runway." preceded by a small lowercase r inside a rounded outlined square. Top-right small badge "MEZO TESTNET". Large heading "Fund once. Claim as you earn." Subheading "MUSD contractor payments with clear payment evidence."

The central and largest area is a numbered left-to-right three-step flow connected with green directional arrows:
"01  FUND" — simple founder wallet icon and exact supporting copy "Deposit the full MUSD amount"
"02  ACCRUE" — clock and linear progress line icon, exact copy "Entitlement grows over time"
"03  CLAIM" — contractor wallet receiving funds icon, exact copy "Earned MUSD goes to the saved recipient"
Make obvious escrow resides between funding and claiming. Label this central container "SMART CONTRACT ESCROW". Add a smaller branching arrow below escrow returning toward founder labelled "Cancel early: unvested funds return to sender". Under the flow add exact text "Earned funds remain claimable after cancellation."

Bottom area: an asymmetric band with three supporting capabilities, no simulated dashboard metrics:
"WORKSPACE" with contractor and invoice document icons, copy "Contractors, invoices and confirmed payment evidence"
"RUNWAY PLANNER" with restrained calendar/runway line icon, copy "Payroll coverage and read-only borrowing scenarios"
"ASK RUNWAY" with understated conversation/source icon, copy "Documentation answers with source links"

Footer exact text "MUSD payments • BTC gas • Wallet-confirmed transactions"
and a smaller readable disclosure "Testnet prototype • Not audited • Borrowing and repayment open in Mezo"
and website "mezo-runway-testnet.vercel.app".
All text must be spelled accurately, avoid duplicated labels and any added features, security claims or numbers. Do not imply automatic payments, automatic borrowing, AI transactions or mainnet support. Crisp presentation-quality finished artifact, not a wireframe.
```

## Icon export specification

```text
Export the existing Runway lowercase r within a mint rounded-square outline.
2048 × 2048 PNG, solid charcoal background #202225, mint #9FC4B2.
1408px outline box, 44px border, 440px radius, 1408px medium-weight
sans-serif r, optically centered. Preserve the existing identity.
```
