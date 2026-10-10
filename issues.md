# Mezo Runway — Open Issues

**Created:** October 10, 2026  
**Source:** Plan review of all project documents  
**Status:** Pre-build phase (build starts October 16)

---

## Pre-Build Decisions (Resolve before October 16)

### ISSUE-01: Deadline timezone unconfirmed
- **Priority:** High  
- **File:** [plan.md](file:///c:/Projects/MEZO/plan.md) — line 208  
- **Problem:** The brief says Wave 1 deadline is October 26 at "15:00" but does not specify timezone. Plan correctly flags this but it remains unresolved.  
- **Action:** Confirm on AKINDO platform countdown or ask in Mezo Discord.  
- [ ] Resolved

### ISSUE-02: Foundry setup not decided (Windows vs WSL)
- **Priority:** High  
- **File:** [wave1Steps.md](file:///c:/Projects/MEZO/wave1Steps.md) — line 106  
- **Problem:** "Foundry, using a supported Windows setup or WSL" — no decision made. Foundry on native Windows can have compilation issues. WSL is the safer path for Solidity development.  
- **Action:** Test Foundry installation now. Decide and document the chosen approach before Oct 16.  
- [ ] Resolved

### ISSUE-03: Static hosting platform not chosen
- **Priority:** High  
- **File:** [wave1Steps.md](file:///c:/Projects/MEZO/wave1Steps.md) — Step 34 (line 810)  
- **Problem:** "Deploy to static HTTPS hosting" — no specific platform selected. Last-minute hosting config eats into submission buffer.  
- **Options:** Vercel, Netlify, or Cloudflare Pages. All support Vite/React SPAs with client-side routing.  
- **Action:** Pick one, test a hello-world deploy, confirm direct URL routing works.  
- [ ] Resolved

### ISSUE-04: EVM wallet for testing not specified
- **Priority:** Medium  
- **File:** [plan.md](file:///c:/Projects/MEZO/plan.md) — §6; [wave1Steps.md](file:///c:/Projects/MEZO/wave1Steps.md) — Step 19 (line 522)  
- **Problem:** "Start with one tested EVM wallet" but no wallet named. MetaMask is the safe default for Mezo testnet compatibility.  
- **Action:** Confirm MetaMask (or alternative), install, and test custom network addition with Mezo testnet RPC.  
- [ ] Resolved

### ISSUE-05: Test wallets and faucet not yet set up
- **Priority:** Medium  
- **File:** [wave1Steps.md](file:///c:/Projects/MEZO/wave1Steps.md) — Step 3 (line 179)  
- **Problem:** Founder and contractor wallets need to be created, funded with test BTC, and MUSD obtained before the build period.  
- **Action:** Create two dedicated wallets, get faucet BTC, borrow test MUSD via [testnet.mezo.org](https://testnet.mezo.org), note any rate limits.  
- [ ] Resolved

### ISSUE-06: Pre-build work rules unconfirmed
- **Priority:** Medium  
- **File:** [wave1Steps.md](file:///c:/Projects/MEZO/wave1Steps.md) — Step 1 (line 146)  
- **Problem:** Unclear what preparation is allowed before the October 16 build period starts. Planning and research are likely fine, but scaffolding code may not be.  
- **Action:** Clarify at the Oct 13 kickoff workshop or ask in Discord.  
- [ ] Resolved

---

## Plan & Architecture Issues

### ISSUE-07: No MEZO token usage
- **Priority:** Low  
- **File:** [plan.md](file:///c:/Projects/MEZO/plan.md) — §5 (line 123)  
- **Problem:** Plan correctly states "MUSD alone meets the brief's asset requirement" (brief says "MUSD and/or MEZO"). However, displaying MEZO token balance in the dashboard would be a zero-cost integration signal.  
- **Action:** Consider adding a MEZO balance read in the dashboard alongside MUSD. Low effort, slight scoring upside.  
- [ ] Resolved

### ISSUE-08: GPL-3.0 license risk from musd repo
- **Priority:** Medium  
- **File:** [plan.md](file:///c:/Projects/MEZO/plan.md) — §12 (line 299)  
- **Problem:** The `mezo-org/musd` repository is GPL-3.0. Copying Solidity implementation code would create license obligations. Plan flags this but no decision is documented.  
- **Action:** Confirm approach: only interface with deployed contracts via ABIs, do not copy source code. Document this decision in `docs/product-scope.md`.  
- [ ] Resolved

### ISSUE-09: Passport spike has no scheduled day
- **Priority:** Low  
- **File:** [wave1Steps.md](file:///c:/Projects/MEZO/wave1Steps.md) — Step 19 (line 522)  
- **Problem:** "Add Passport after the basic flow works" is mentioned but no day is allocated in the schedule. It's also not in the cut list.  
- **Action:** Acceptable to defer. If attempted, slot it into Oct 23–24. Otherwise add it to the cut list explicitly.  
- [ ] Resolved

### ISSUE-10: `.env.example` contents undefined
- **Priority:** Low  
- **File:** [wave1Steps.md](file:///c:/Projects/MEZO/wave1Steps.md) — Step 6 (line 269)  
- **Problem:** `.env.example` is in the project structure but its expected variables are not listed.  
- **Expected contents:**
  ```
  VITE_MEZO_TESTNET_RPC=https://rpc.test.mezo.org
  VITE_MEZO_TESTNET_CHAIN_ID=31611
  VITE_MUSD_ADDRESS=
  VITE_PAYMENT_CONTRACT_ADDRESS=
  VITE_TESTNET_EXPLORER=https://explorer.test.mezo.org/
  ```
- **Action:** Define during Step 7 (development configuration).  
- [ ] Resolved

### ISSUE-11: Oct 17–19 schedule is tight
- **Priority:** Low  
- **File:** [wave1Steps.md](file:///c:/Projects/MEZO/wave1Steps.md) — §17 (lines 887–889)  
- **Problem:** Contract spec + implementation + full test suite (unit, fuzz, invariant) + deployment in 3 days is ambitious for a solo developer. Fuzz and invariant tests can be time-consuming to debug.  
- **Action:** Prioritize unit tests on Oct 18–19. Defer fuzz/invariant tests to Oct 23 if needed — they improve submission quality but aren't blocking.  
- [ ] Resolved

---

## Cosmetic / Documentation Issues

### ISSUE-12: Backslash escapes in wave1Steps.md headings
- **Priority:** Very Low  
- **File:** [wave1Steps.md](file:///c:/Projects/MEZO/wave1Steps.md) — throughout  
- **Problem:** Section headings use `2\\.` instead of `2.` — unnecessary backslash escapes. Renders correctly but looks odd in raw markdown.  
- **Action:** Optional cleanup. Find and replace `\\.` with `.` in numbered headings.  
- [ ] Resolved

### ISSUE-13: Non-standard link syntax in wave1Steps.md
- **Priority:** Very Low  
- **File:** [wave1Steps.md](file:///c:/Projects/MEZO/wave1Steps.md) — lines 127–136  
- **Problem:** Links use `[text](<url>)` with angle brackets. Works but non-standard. Standard `[text](url)` is cleaner.  
- **Action:** Optional cleanup during documentation polish.  
- [ ] Resolved

---

## Summary

| Priority | Count | Status |
|----------|-------|--------|
| High | 3 | ⬜ Open |
| Medium | 3 | ⬜ Open |
| Low | 4 | ⬜ Open |
| Very Low | 2 | ⬜ Open |
| **Total** | **13** | **All open** |

**Next action:** Resolve ISSUE-01 through ISSUE-06 before October 16.
