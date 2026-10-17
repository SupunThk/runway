# Runway project handoff

## Latest local work — Ask Runway assistant, October 17, 2026

Phase 1 assistant is implemented locally, **uncommitted and undeployed**, following the user's instruction to use the paid Gemini key already configured in root `.env`. The key was not printed, changed or committed. Production remains reconciliation release `a95c4a9` on both frontend and backend. Preserve all existing local release records and scope changes.

`/assistant` and `/assistant/` provide a minimal, responsive chat page in the shared sidebar, suggested questions, follow-ups, source/app links, stop/retry and New chat. `docs/assistant-knowledge.md` is the reviewed, AI-readable public knowledge boundary, parsed by `apps/api/src/assistant-knowledge.ts`. It covers the shipped app and selected official Mezo concepts. Do not add internal handoffs, credentials or user records to that file. Public guide content and `docs/user-guide.md` include assistant usage/privacy.

`apps/api/src/assistant.ts` uses AI SDK 7.0.143 and Google provider 4.0.99 directly with server-only `GEMINI_API_KEY`; configurable `GEMINI_MODEL` defaults to `gemini-3.8-flash`, checked against the live model list. One isolated scope call chooses public source sections; a second isolated call generates a structured answer only from those sections. The server validates source IDs and attaches registered links. Out-of-scope, live-data and unsupported requests receive fixed responses. No wallet/RPC/database/transaction tools, provider chat session or private workspace data enter model context. Only up to six prior user questions are included for follow-ups; prior assistant answers are excluded. The UI holds its conversation in page memory and clears it on New chat/reload. Provider processing policies are separate from app transcript storage. Model-based topic classification is tested, not a mathematical guarantee.

The public POST route in `app.ts` requires exact Origin and validates bounded bodies/questions. MongoDB stores anonymous usage counters, not transcripts: six/client-hint/minute, thirty globally/minute, configurable 200 requests/UTC day by default, and two concurrent requests/process. IP hints are not an authentication boundary; global limits remain authoritative. Each request has at most two model calls, 2,200 output tokens/call, no SDK retries and a 45-second inference deadline. Failed attempts consume quota. `ASSISTANT_ENABLED=false` disables it. This caps requests, not dollar spend. See `docs/backend.md` for configuration and release ordering. Full structured answers are validated before display rather than streaming unvalidated output.

Validation: TypeScript and 52 unit/API tests passed; all 53 browser cases passed after resolving duplicate viem instances with Vite `resolve.dedupe` and pinning shared Zod 4.6.5 at the root/API. Live Gemini evaluated 18/18 routing cases across app/Mezo answers, follow-ups, live-data requests, unrelated topics and prompt-injection attempts. Manual answer review tightened funded/paid retrieval to always include exact reconciliation semantics. A subsequent real browser → Vite proxy → Hono → Gemini check confirmed the corrected full-amount paid distinction with sources, refusal of an unrelated/key-extraction request, cleared New chat context, five viewport sizes and no page errors. Desktop/mobile screenshots visually reviewed. Isolated temporary MongoDB was used; no production workspace records or financial transactions were touched. Earlier full browser failures and a preview-origin mismatch were corrected before these successful checks; no payment contract/transaction code was changed.

Final production build, formatting and whitespace checks passed. Public asset scan confirmed the actual Gemini key and MongoDB URI are absent from all four build assets, and the Gemini provider transport is not bundled in the frontend. Existing bundle-size warning remains. React review confirmed hook cleanup/cancellation, bounded model context, explicit accessible control labels and safe plain-text answer rendering. This is local validation, not a hosted assistant release.

Ignored local preview helper `.tools/assistant-preview.mjs` serves http://127.0.0.1:5174/assistant with real Gemini and an isolated temporary database. It is running for user review; normal development remains `pnpm dev`. Ignored evidence/helpers: `.tools/assistant-eval.mjs`, `.tools/assistant-eval.json`, `.tools/verify-assistant-live.mjs`, `.tools/assistant-live.check.json`, `.tools/assistant-*.png`, `.tools/check-assistant-assets.mjs`. Restart the preview after backend changes because the helper does not watch backend source. Local `.env` is preserved. Before a future production release, configure the key securely in Render, release backend first, verify the real proxy/model path, then release the frontend. The key is not automatically copied from local `.env`. Phase 2 wallet/transaction reads and Phase 3 confirmed actions remain unimplemented.

## Scope addition — phased AI assistant, October 17, 2026

User requested an assistant for app/Mezo questions first, with wallet/transaction reads and app actions in later phases. Added `docs/ai-assistant.md` and updated `plan.md` / `docs/development-workflow.md`. Phase 1 is a wallet-free, sourced Q&A page over reviewed public Runway guidance and official Mezo documentation, using the existing React/Hono architecture. Phase 2 adds validated read-only tools; Phase 3 prepares supported actions for explicit user review and wallet confirmation. Autonomous signing and fund movement remain excluded. No assistant implementation, dependencies, provider account, credentials, paid services, commit or deployment is part of this scope-only update. Choose the provider/model and usage budget before enabling inference. Preserve the existing local release-record changes below. The payment reconciliation release remains the current deployed application.

## Current release — payment reconciliation deployed, October 17, 2026

This entry supersedes all older local/uncommitted reconciliation and production-source statements below. User authorized the coordinated release. Source commit `a95c4a9a00bcc83c9df9c918f33a213c47f05ea2` is committed and pushed to both `main` and `deploy/render-backend-2026-10-13`.

Render backend is live on that commit, service `srv-db75jus9v7es73ai4g00`. Code rollout `dep-db9om8e1egvs73d06nrg` completed first; merging only `PAYMENT_INDEXER_ENABLED=true` into existing settings triggered live rollout `dep-db9onn6q1p3s7391ld30`. Other settings and secrets were preserved. The source branch remains the deployment branch, auto-deploy remains commit-triggered, and health checks remain TCP. No paid service or separate hosted worker was created.

Initial backfill completed using the reviewed fenced indexer. Temporary local catch-up processes used normal 500-block batches and the supported 5,000-block bound after a read-only historical RPC probe succeeded; both processes exited successfully. Render now maintains its normal 500-block batches and 12-block confirmation buffer. At final hosted verification, reconciliation was ready at checkpoint `16210018` with two schedules; read-only RPC reads at that checkpoint matched all published totals, claims, cancellations, refunds and remaining entitlement. Free Render sleep still pauses indexing; stale evidence is hidden until wake-up/catch-up.

Only after backend verification, `main` was pushed to release the frontend. Vercel production deployment `dpl_3LVEzS1QAoU5ipKee6S6v4UkEpZZ` is READY and aliased to https://mezo-runway-testnet.vercel.app. Deployment URL: https://mezo-runway-testnet-73lc5xklu-supunthks-projects.vercel.app.

Release checks passed: TypeScript, all 38 unit/API tests, all 48 browser cases, build, formatting and whitespace. Backend-branch GitHub CI run `39042434072` passed, including contract checks. Hosted checks passed through the real Vercel proxy/API/Atlas: generated-wallet signatures/cookie attributes, persistence/reload, owner isolation, replay rejection/logout, ready reconciliation metadata, opaque invoice references, draft status, mismatched legacy-link rejection and exact reference/recipient/amount prefilling. All four public navigation checks passed at desktop/mobile widths. Mobile screenshot visually reviewed without overflow or page errors. Render error scan since rollout and Vercel deployment error scan over the last hour returned no entries; monitoring/drains were not assessed. Existing bundle-size warning remains.

Main-branch GitHub CI run `39043480367` also completed successfully for the released commit, including contract and browser tests.

No blockchain transactions were submitted. Verification created only temporary generated-wallet business/auth records and removed them afterward; indexing wrote production reconciliation collections as authorized. Successful automatic matching and legacy linking are covered by isolated API/browser tests; hosted verification used read-only real-schedule projections and rejected mismatched links, without altering existing user invoices. Installed real-wallet login is still pending.

Evidence: `deployments/reconciliation-release.check.json`; ignored `.tools/reconciliation-backend.check.json`, `.tools/reconciliation-release.check.json`, `.tools/reconciliation-status.mjs`, `.tools/reconciliation-catchup.mjs`, `.tools/verify-reconciliation-release.mjs` and `.tools/hosted-workspace-mobile.png`. Vercel MCP still returns project 404; installed `vercel.cmd` 54.9.1 successfully inspects the intended project, alias and logs. Release-record updates remain local until a later documentation commit; deployed implementation is committed. Preserve `.env` and historical deployment evidence.

Next: installed-wallet hosted login with the user; optional Render HTTP health-check/CI-gating configuration when Dashboard access is available; remaining scoped Wave 1 work and demo/submission materials. Do not repeat financial tests or redeploy merely to recover context. Older next-session prompts and saved-state sections below are historical.

## Latest local work — payment reconciliation, October 15, 2026

Payment reconciliation is implemented locally, **uncommitted and undeployed**. Production frontend remains `c03a337`; Render backend remains `023087f`. Preserve the existing deployment-record changes and untracked evidence file below.

New invoices receive a random opaque reference carried into funding calldata. Invoice lists derive confirmed payment evidence from the verified deployment, requiring exact owner, recipient and base-unit amount. Workspace shows committed, claimed, remaining entitlement and refunded amounts, refreshes payment status and supports verified legacy schedule linking. Legacy links are unique across invoices. Duplicate references are flagged for review. Stored invoice `status` remains draft; `payment.status` is separate derived evidence. Stale or unavailable evidence is hidden.

The indexer verifies chain, deployed bytecode and token, processes 500-block batches with a 12-block confirmation buffer, stores checkpoints/events, and publishes immutable snapshots through fenced leases. It retries failures and rebuilds after reorgs or expired retention. Enable explicitly with `PAYMENT_INDEXER_ENABLED=true` in the API, or run `pnpm --filter @runway/api index:payments` separately. It is disabled by default. No production database writes or hosting configuration changes were made. Free Render sleep pauses embedded indexing. See `docs/payment-reconciliation.md` for operation, API semantics, retention and scale limits.

Validation passed: 38 unit/API tests, all 48 browser cases, TypeScript, production build, formatting and whitespace. Browser coverage includes automatic matching, partial claims, cancellation/refunds, unavailable indexing and manually linking legacy schedules. Live read-only RPC checks confirmed deployment bytecode/token identity, historical logs and schedule reads. Mobile screenshot reviewed without overflow. No financial transactions occurred. Browser tests now launch only the frontend and use the isolated fixture API/database, avoiding an enabled local API indexer. Existing bundle-size warning remains.

Next release must coordinate backend deployment to Render's tracked `deploy/render-backend-2026-10-13` branch and enable indexing before releasing the frontend. Wait for catch-up and verify hosted reconciliation. A main-branch push alone does not deploy the backend. Real installed-wallet login remains pending. This local implementation supersedes the old indexer backlog below; it has not been committed, pushed or deployed.

Implementation map: `apps/api/src/reconciliation.ts` contains the RPC adapter, checkpointing and invoice projections; `payment-worker.ts` runs the retry loop; `index-payments.ts` is the standalone entry point. `server.ts` starts embedded indexing only when enabled. API routes and indexes are in `app.ts`/`db.ts`. Funding references are passed by `apps/web/src/App.tsx`; invoice display, polling and linking are in `Workspace.tsx`. Tests are in `reconciliation.test.ts`, `app.test.ts` and `tests/workspace.spec.ts`. User guidance is generated from `apps/web/src/guide.ts` into `docs/user-guide.md`.

All reconciliation changes remain in the working tree, including untracked source files and `docs/payment-reconciliation.md`; a later commit must include those new files explicitly. `.env.example` documents opt-in settings; the actual `.env` was preserved. Ignored evidence includes `.tools/reconciliation-rpc.mjs` (read-only RPC probe), `.tools/reconciliation-mobile.png` and `.tools/workspace-mobile.png`. The results above were recorded during implementation, not rerun for this handoff-only request. No new commit, push, deployment or transaction is part of this update.

## Latest release — UI refresh deployed, October 15, 2026

User authorized deployment. The visual UI refresh is committed and pushed to `main` as `c03a337f7db06c0a20ab4dbf44112bf7ccceecbc` (`Refresh Runway dashboard design and responsive layouts`). Vercel production deployment `dpl_CMHDXEFn8TYK9RE9EtobZtTzr843` is READY and aliased to https://mezo-runway-testnet.vercel.app; build duration 15 seconds. Deployment URL: https://mezo-runway-testnet-k5hhzndie-supunthks-projects.vercel.app. This supersedes the frontend release references below. Render backend remains `023087f`.

Changes in `apps/web/src/style.css` and `apps/web/src/App.tsx` introduce Geist/Geist Mono typography, zinc surfaces, charcoal navigation, forest green accents, an asymmetric balance ledger, responsive layouts, larger controls, reduced-motion support and an accessible schedule-loading skeleton. Design rules are in `DESIGN.md`; implementation and validation notes are in `docs/ui-refresh.md`.

Release checks rerun successfully: TypeScript, 30 unit/API tests, all 48 browser cases, production build, formatting and whitespace. Local and hosted responsive checks passed for five pages at 320/390/768/1024/1440/2560px (30 checks each), keyboard focus and reduced motion. Four hosted navigation tests passed. Live mobile screenshot visually reviewed; no page errors or horizontal overflow. Production CSS exactly matches the checked local build. Hosted `/api/health` returned ready/database connected. Vercel error-log scan for the last hour returned no logs; monitoring/drains were not assessed. Existing bundle-size warning remains. No financial transactions occurred. GitHub CI run 38743612268 completed successfully, including typecheck, unit/API tests, build, contracts and browser tests.

Current working tree retains deployment records in this file, `docs/backend.md`, `docs/test-results.md` and untracked `deployments/render-backend.check.json`. Preserve them. The UI files, `DESIGN.md` and `docs/ui-refresh.md` are committed. This handoff entry remains local/uncommitted. Ignored verification tools include `.tools/verify-ui.mjs`, `.tools/verify-ui-asset.mjs`, `.tools/ui-verification.json`, `.tools/ui-*.png` and `.tools/playwright-navigation-live.config.ts`. Real installed-wallet login remains pending; the next major feature is event indexing and invoice/payment reconciliation. Older “local saved state” and “suggested prompt” sections below predate this release and are superseded by this entry. Do not redeploy merely to recover context.

## Borrowing tab deployed and verified — October 15, 2026

Latest frontend release is now `db79a53be0b10bfe488cf8400fd6fa5ab3c8fb4b` (`Move Mezo borrowing into a dedicated dashboard`), committed and pushed to main with user authorization. Vercel production deployment `dpl_GqPKPBWtn2x5pKWiTigvjj2gEV2c` is READY, built in 15 seconds and aliased to https://mezo-runway-testnet.vercel.app. Deployment URL: https://mezo-runway-testnet-cbqe48583-supunthks-projects.vercel.app.

Borrowing has its own sidebar tab and `/borrowing` page (also `/borrowing/`), with existing read-only position data and BTC stress scenarios plus an explanation. Overview has a link to the page. Loan management still opens Mezo; no new protocol writes were implemented. Documentation remains at the bottom. User guide and both normal/static-fallback hosting routes were updated.

All 48 local browser tests, TypeScript, production build, formatting and whitespace passed before release. GitHub CI job for run 38721315922 completed successfully, including typecheck, unit/API tests, build, contracts and browser tests. Four public production navigation checks passed at 1280px/390px/320px, including both borrowing routes and refresh, correct active tab, Back/Forward, no document reload, no page errors or horizontal overflow. Hosted `/api/health` returned ready/database connected; live 320px screenshot visually reviewed. Deployment error-log scan for the last hour returned no logs; monitoring/drains were not assessed. No blockchain transactions occurred. Ignored `.tools/playwright-navigation-live.config.ts` can rerun the public navigation checks. Older release references below are historical.

Preserve existing local handoff/backend/test-record changes and untracked backend evidence. This release entry remains local/uncommitted. Installed-wallet hosted login remains pending; next major feature is event indexing and invoice/payment reconciliation.

## Navigation fix deployed and verified — October 15, 2026

User authorized committing and deploying the shared-sidebar/navigation fix. `main` and `origin/main` now contain `bf80faf6bd6f7164a8d104d12acf76b4de487616` (`Keep sidebar navigation consistent without page reloads`). Vercel production deployment `dpl_CvbwaYwDSQeF5GaBwtSyUvr4CcJd` is READY and aliased to https://mezo-runway-testnet.vercel.app; deployment URL https://mezo-runway-testnet-6odjwigpe-supunthks-projects.vercel.app. Git-triggered build took 14 seconds. Backend remains on the existing Render deployment/branch described below.

All pages share one sidebar: Overview, New schedule and Workspace retain their order, and Documentation sits in the sidebar footer. Internal route changes use browser history without full document reloads; query-prefilled payment links and normal modified/external/download/anchor links retain their behavior. Local verification: 44 existing browser cases passed, then all three new navigation cases passed after correcting a test-only logo-text expectation; TypeScript, production build, formatting and whitespace checks passed. Existing bundle-size warning remains.

Public production navigation checks passed at 1280px, 390px and 320px, covering link order, Documentation placement, active states, no document reload, Back/Forward, navigation to the funding form and no horizontal overflow or page errors. Hosted `/api/health` returned ready/database connected. Live mobile screenshot visually reviewed. GitHub CI 38719713517 completed successfully for this exact commit. Vercel deployment error-log query for the last hour returned no logs; monitoring/drains were not assessed. Ignored hosted checker config/screenshots: `.tools/playwright-navigation-live.config.ts`, `.tools/navigation-*.png`.

Next: user should open the hosted `/workspace` page in their wallet browser, connect their wallet and sign the login message, then check workspace loading. No connected computer-use browser was available in this session; installed-wallet validation remains pending. No blockchain transactions were submitted. Existing local deployment-record changes and untracked `deployments/render-backend.check.json` were preserved; this new handoff entry is also local/uncommitted. Next major feature after validation is event indexing and invoice/payment reconciliation. Older frontend commit/status references below are historical.

## Backend deployed and verified — October 13, 2026

User authorized deployment and confirmed Render My Workspace. Backend is live at https://runway-api-rw61.onrender.com (free, Singapore, `srv-db75jus9v7es73ai4g00`, deployment `dep-db75jvs9v7es73ai4ibg`, backend source `023087f`). Frontend remains at https://mezo-runway-testnet.vercel.app with same-origin `/api` proxy, released from `727dd13` as Vercel production deployment `dpl_H1xLxyPjCYSirAVs1etFuL7Zd8G2` (READY and aliased). MongoDB stays in Atlas; its URI was transferred from ignored local `.env` to Render and never displayed or committed.

Hosted browser/API/Atlas verification passed at 2026-10-13T16:24:52Z: direct and proxied health; Origin rejection; actual login challenge signatures using generated test wallets; Secure/HttpOnly/SameSite=Strict cookie on frontend domain; workspace/contractor/draft invoice persistence across reload with exact Atlas base units; owner isolation; nonce replay rejection; exact recipient/amount prefilling; logout cookie clearing and stored-session revocation. The 390px screenshot was visually reviewed without overflow or page errors. Verification-only records were removed. No blockchain transactions occurred. Installed real-wallet extension signing is still a separate validation. Evidence: `deployments/render-backend.check.json`; ignored checker `.tools/verify-render-release.mjs`.

Release checks passed: 30 unit/API and 44 browser tests, TypeScript, formatting, build and whitespace. Backend source GitHub CI 38427943026 and production release CI 38430041672 both passed. Render logs show 0.0.0.0:10000 startup and no error logs in the checked window. Current Render service tracks `deploy/render-backend-2026-10-13` with commit-triggered auto-deploy and default TCP health checks; the Blueprint is not applied. Future backend changes must reach that branch until deliberately switching the service to main. The MCP tool cannot set HTTP healthCheckPath; Dashboard access was unavailable. Explicit HTTP health/database verification passed. See docs/render-hosting.md for actual configuration.

## Scope update — October 13, 2026 (deployment status superseded above)

Hosting decision updated after the backend increment: the user chose Render for the Node API, keeping the frontend on Vercel and database in Atlas. Cloud MongoDB ping and index initialization succeeded with the user's `.env` after DNS troubleshooting; credentials were never printed. `render.yaml`, PORT/0.0.0.0 listener support and a frontend proxy-configuration script are prepared. The previous Vercel API adapter is removed. Render deployment and Vercel proxy activation are now complete and verified; see the current status above and `docs/render-hosting.md`.

The user approved MongoDB and expanding Wave 1. Local work adds a TypeScript/Hono API, pooled MongoDB access/indexes, EOA wallet-message authentication, owner-private workspaces, contractor directory, draft invoices and `/workspace`, with prefilled links into the existing funding form. Database credentials are configured in ignored root `.env` and Render server settings. This increment was committed, pushed, deployed and verified with the user’s authorization.

Read `docs/backend.md` for configuration and `docs/development-workflow.md` for the current roadmap. Former Wave 2 borrowing/repayment, planning, Passport, reusable helpers and pilots are now Wave 1 targets, still unimplemented where not explicitly recorded. Indexing and confirmed invoice/payment reconciliation remain upcoming. Wave 2 expands into payroll operations, contractor submissions, approvals, forecasting, team roles/multisig and notifications. Original backend-free scope and deferrals below are historical and superseded by this revision.

Local verification passed: 30 unit/API tests (including nine against temporary MongoDB), all 44 browser cases, TypeScript, backend/frontend build, formatting and whitespace checks. The browser flow covers login, persisted workspace/contractor/invoice creation, reload recovery and exact payment prefilling; rejected signing remains recoverable. The 390px workspace screenshot was visually reviewed without horizontal overflow. Tests use temporary databases and simulated wallets, not the user's MongoDB account or real signing. The existing bundle-size warning remains. CI caches the isolated MongoDB test binary. No contract changes or blockchain transactions occurred; the backend and frontend were subsequently deployed and verified as recorded above.

Preserve the pre-existing historical handoff content. The cause of historical browser CI failure 38117460629 remains uninvestigated; both current release CI runs passed. Hosted persistence, routing, cookies and database access are verified. The existing payment contract remains unchanged. Keep backend values server-only, without VITE_ prefixes.

Updated October 15, 2026. Read the latest deployment entries at the top first when continuing in a new session. This records completed work and verified results; balances and deployment checks are historical snapshots. This handoff-only update does not authorize further feature work, commits, pushes or deployments.

## Historical end-of-day status — October 11 (superseded by October 13 status)

- User finished for the day and requested this handoff update. Do not continue feature work or redeploy as part of this update.
- Latest committed and pushed application release: `b309e7b08f4f62909460f7f15751ed96a964c8c9` (`Add Runway user documentation and downloadable guide`), on `main`.
- Production deployment `dpl_EMyR7AMmss43ipT1xsAwPDqd4ijS` is READY and assigned to https://mezo-runway-testnet.vercel.app. Deployment URL: https://mezo-runway-testnet-4uvg5s1l9-supunthks-projects.vercel.app.
- User documentation is live at https://mezo-runway-testnet.vercel.app/docs. Unauthenticated public browser checks passed for `/docs` and `/docs/`, section links, the identical Markdown download, navigation to/from New schedule, 390px/320px mobile layouts without overflow, and no page errors. Reading the guide required neither a wallet nor Mezo RPC requests.
- **First next-session task: investigate the failed GitHub browser-test step.** [CI run 38117460629](https://github.com/SupunThk/runway/actions/runs/38117460629) completed with failure in `Run pnpm test:browser`. Earlier typecheck, unit-test, build and contract-test steps passed. The exact failing browser case/cause has not been investigated. Do not describe this release as having all CI checks passing. Vercel deployment is not gated on CI, so production is live despite this failure.
- Previous release `797c910` passed all CI checks, including browser tests. Use it as the comparison baseline; do not assume the new failure's cause.
- Core Wave 1 implementation is complete: funded schedules, claims/cancellation, history/receipts, CSV/recovery, read-only borrowing, BTC scenarios, schedule pagination, explorer source verification, adversarial/invariant tests, and user documentation.
- Full Wave 1 release work remains: demo video/submission materials, final release review/tag, final hosted two-wallet extension validation, and external confirmations (registration/Discord, deadline timezone, and early-work eligibility). Earlier real on-chain payment tests are already complete; do not repeat them just to recover context.
- A separate backend is not required for Wave 1. Prioritize a clear complete payment demonstration before adding scope. Borrowing and repayment remain in Mezo.
- This handoff-only update is saved locally after the deployed commit; it has not been committed or pushed. Inspect `git status` before the next change.

## 1. What this project is

Runway is a testnet payment protocol and web app on Mezo. A sender deposits the full MUSD payment upfront, the recipient earns it linearly over a chosen duration, and claims transfer earned funds to the fixed recipient.

A TypeScript/Hono backend on Render stores owner-private workspaces, contractors, draft invoices and wallet-login sessions in MongoDB Atlas. The React frontend stays on Vercel and calls relative `/api` paths through a same-origin proxy. It also reads blockchain state through RPC; the Solidity contract holds the money and enforces payment rules. Wallets sign login messages and authorize financial transactions separately.

Mezo borrowing is separate. Runway does not currently borrow, lend, repay loans, earn yield, or automatically submit claims. Paying a contractor does not repay a Mezo borrowing position. Read-only founder/contractor position checks were verified October 11 (see section 8); saved values are historical snapshots.

The user is learning these concepts. Explain steps plainly and use the existing testnet accounts and contract. [explanation.md](explanation.md) is the beginner's guide.

## 2. Where everything is

| Item | Value |
| --- | --- |
| Local workspace | `C:\Projects\MEZO` |
| Shell | Windows PowerShell |
| GitHub repository | https://github.com/SupunThk/runway |
| SSH remote | `git@github.com:SupunThk/runway.git` |
| Branch | `main`, tracking `origin/main` |
| Public frontend | https://mezo-runway-testnet.vercel.app |
| Workspace page | https://mezo-runway-testnet.vercel.app/workspace |
| Borrowing page | https://mezo-runway-testnet.vercel.app/borrowing |
| Public backend health | https://runway-api-rw61.onrender.com/api/health |
| Render workspace | My Workspace (`tea-d7p2hoa8qa3s73et5nl0`) |
| Render service | `runway-api` (`srv-db75jus9v7es73ai4g00`), free, Singapore |
| Render source branch | `deploy/render-backend-2026-10-13`, deployed backend `023087f` |
| Database | MongoDB Atlas; `runway`; server-only URI |
| Local frontend | `http://127.0.0.1:5173` when the dev server is running |
| Vercel team | `supunthks-projects` |
| Vercel project | `mezo-runway-testnet` |
| Vercel project ID | `prj_xVu0NEGFRc47pJFYnZI87erHvqoX` |
| Vercel team ID | `team_0003YMxdv6pi0w9vMdCToeSG` |

Latest deployed frontend/application commit: `db79a53be0b10bfe488cf8400fd6fa5ab3c8fb4b` (dedicated Borrowing dashboard), on `main` and `origin/main`. Previous release `bf80faf` fixed sidebar order and full-page navigation reloads. Render currently runs backend source `023087fc68715d16bb6d24dd8a289608230c9cbc` from the deployment branch. The initial implementation commit was `8a58ef1`. Run `git status` and `git log` at the start of the next session; handoff updates can remain local after an application release.

## 3. Network, assets, and accounts

| Setting | Verified value |
| --- | --- |
| Network | Mezo Testnet |
| Chain ID | `31611` |
| RPC | `https://rpc.test.mezo.org` |
| Explorer | `https://explorer.test.mezo.org` |
| Native gas currency | BTC, 18 decimals |
| MUSD token | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`, 18 decimals |
| MEZO token | `0x7B7c000000000000000000000000000000000001`, 18 decimals; unused in the payment flow |
| Payment contract | `0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D` |
| Founder / sender | `0x1ac891Ce491851AC87851D62B9184c75A76f55cF` |
| Contractor / recipient | `0x99d7a7dcf20a0ac9fc3D03Cd90b0a1F4BC561b09` |

The user controls both test accounts and tested with Brave Wallet. Rabby and MetaMask selection are also supported. Automated wallet tests use simulated providers; they do not prove every installed extension's signing behavior.

The contract was deployed by the founder in transaction:

`0xdb151ec249a704f17390ba6b35ef5458924deff142a796995c60773c3a80f45f`

Deployment block: `16083735`. Successful receipt, founder, exact local creation bytecode, constructor MUSD argument, deployed code and immutable token getter were verified. Explorer exact-match source verification is complete; see `docs/explorer-verification.md`. An independent audit has not been performed. Reuse this contract for the current app; another deployment is unnecessary for ordinary frontend work.

## 4. Completed implementation

- React/Vite/TypeScript workspace with wagmi, viem and TanStack Query.
- Wallet picker with EIP-6963 discovery, explicit Rabby/MetaMask selection, generic injected-wallet fallback, disconnect and connection-error recovery.
- Mezo testnet configuration checks, token metadata checks and payment-contract/MUSD validation before enabling writes.
- Actual wallet MUSD and BTC balances, funded obligations, and schedule reads.
- Exact MUSD allowance approval followed by a separate fully funded creation transaction.
- Start time based on blockchain time, approximately two minutes after approval; configurable duration in whole minutes.
- Recipient routes at `/schedules/<id>`, including public access without connecting a wallet.
- Linear accrual, claims, sender cancellation and preserved unpaid earned entitlement.
- `COMPLETED` status for fully paid uncancelled schedules; `CANCELLED` remains visible after cancellation settlement.
- Cancellation details: recipient's total earned amount and sender's refund.
- Cancellation hidden after the end time; explanatory messages for settled or still-unpaid schedules.
- Schedule and claimable reads pinned to the same block for consistent accounting.
- Fixed navigation from a recipient page into creating another schedule. Previously creating from `/schedules/1` returned users to the old schedule.
- Solidity tests, accounting tests, browser tests, deployment verification scripts and public-site verification.
- Git repository created and pushed to GitHub; existing Vercel project connected to it.

Contract rules: recipient cannot be changed; anyone may trigger a claim, but it always pays the stored recipient; only the sender may cancel, and only before the end; cancellation refunds unearned money and preserves earned money. The contract is non-upgradeable and has no admin withdrawal or application fee.

## 5. Real two-wallet tests completed

The user signed the transactions. The agent verified the results through read-only RPC inspection.

| Result | Schedule 1 | Schedule 2 |
| --- | --- | --- |
| Total funded | 1 MUSD | 1 MUSD |
| Duration | 5 minutes | 10 minutes |
| Final status | Completed | Cancelled and settled |
| Recipient earned and claimed | 1 MUSD | 0.628333333333333333 MUSD |
| Sender cancellation refund | None | 0.371666666666666667 MUSD |
| Remaining claimable | 0 MUSD | 0 MUSD |

At blocks `16084331` and `16084332`, the contractor held `1.628333333333333333 MUSD` and the payment contract held zero MUSD. These are recorded balances, not a live balance guarantee.

Schedule 2's cancellation transaction is `0xc925c772c8205fcfd90721cd52a731945ccdbd5d07086a52592c5195571eb90c`. Its final claim transaction is `0x450fb17cfe85d50da8c81cbc520641e50f908f4102fd3032bc6dd10b7edb5ce6`.

Full event histories and transaction hashes are in:

- [deployments/schedule-1.check.json](deployments/schedule-1.check.json)
- [deployments/schedule-2.check.json](deployments/schedule-2.check.json)

Both tests are finished. Do not ask the user to repeat them just to establish project context. Existing on-chain history is suitable for developing the next feature.

## 6. Hosting and automatic deployment

The app was first published as a local static build. It was then changed to GitHub-driven source builds using the **same Vercel project and public URL**.

Latest confirmed GitHub deployment:

- ID: `dpl_GqPKPBWtn2x5pKWiTigvjj2gEV2c`
- Source: GitHub, `SupunThk/runway`, branch `main`
- Commit: `db79a53be0b10bfe488cf8400fd6fa5ab3c8fb4b`
- Result: production READY, aliased to https://mezo-runway-testnet.vercel.app
- Deployment URL: https://mezo-runway-testnet-cbqe48583-supunthks-projects.vercel.app
- API: Vercel `/api/:path*` forwards to https://runway-api-rw61.onrender.com/api/:path*.
- Current frontend CI run 38721315922 passed, including all 48 browser cases. Backend source CI also passed. Public post-release navigation/route checks passed at desktop and mobile sizes; hosted API/database health passed.

Pushes to `main` trigger production builds. Other branches can receive preview deployments. GitHub Actions also runs checks, but those checks are **not currently a gate** on Vercel production deployment.

Project build settings:

| Setting | Value |
| --- | --- |
| Root | Repository root |
| Framework | Other |
| Node | `24.x` |
| Install | `corepack pnpm install --frozen-lockfile` |
| Build | `corepack pnpm build` |
| Output | `apps/web/dist` |

Vercel has the five public `VITE_` values from `.env.example`, plus `ENABLE_EXPERIMENTAL_COREPACK=1`, configured for production, preview and development. The root ignored `.env` is not uploaded through GitHub. No wallet private key is needed for frontend hosting.

The Vercel connector initially had restricted/stale access (403 on project creation and later 404 on the new project). The authenticated **Vercel CLI fallback succeeded**. Use explicit team/project scope for future operations. The static fallback directory `.publish/mezo-runway-testnet` has a local Vercel project link; do not assume an arbitrary directory is linked to the correct project.

Important evidence distinction: `deployments/mezo-testnet.frontend.json` describes the **initial static deployment**, not the later GitHub deployment above. It is not evidence that GitHub integration is missing. See [docs/frontend-hosting.md](docs/frontend-hosting.md) for the current workflow.

## 7. Verification already performed

- 9 Solidity tests passed, including 256 fuzz cases.
- 4 integer/accounting tests passed.
- 12 browser tests passed: existing wallet/navigation/mobile checks plus completed, cancelled-unpaid and cancelled-settled display cases.
- Production build and TypeScript checks passed locally and in the GitHub-triggered Vercel build.
- Real deployment, full payment, cancellation refund and post-cancellation final claim verified on testnet.
- Unauthenticated production browser verification passed after the GitHub deployment at `2026-10-10T14:16:11.517Z`: homepage, both recipient pages, direct-link refresh, exact settlement amounts and mobile viewport; no uncaught page errors.

The original public-site report and screenshot are tracked in `deployments/frontend.check.json` and `deployments/frontend-mobile.png`. The later GitHub-build verification report was retained locally at `.tools/vercel-config/github-frontend.check.json` (ignored; may not exist in a fresh clone).

The counts above describe the initial release. The Solidity suite now passes 24 tests with adversarial token/reentrancy coverage and two stateful invariant campaigns; the previous release passed 42 browser tests and 21 unit/accounting tests in CI. The October 11 documentation release had a browser-test CI failure whose cause remains uninvestigated. October 13 backend source and production release CI both passed, including browser tests; current local counts are 30 unit/API and 44 browser cases. Real extension signing on the final public HTTPS origin remains unverified by the agent. The build still warns about a JavaScript bundle over 500 kB. There is no independent security audit.

## 8. Transaction history and receipts (deployed October 11)

Implemented following the user's request to continue, then committed and deployed with their approval. Commit `5f57dd1c0a3910c2575918c5b7fb1a4a98f6b2a7`, production deployment `dpl_Ht7cNXdYBvUd76u8XtRyt2HqYGUL`, is READY at the existing public URL. The HTTPS browser check verified all four events and JSON receipts for each schedule, scanning through snapshot heads 16094353 and 16094354. Each schedule has an expandable **Transaction history & receipts** section; opening it does not require a wallet.

- Shows funding, every claim and cancellation refunds in block/log order, with exact MUSD amounts, UTC block timestamps and explorer links.
- Downloads individual JSON event receipts containing chain/contract/schedule identifiers, transaction and block hashes, log index, raw integer amounts and formatted MUSD. These are event evidence; the explorer provides the network transaction receipt.
- Scans from deployment block `16083735` in 1,000-block RPC chunks, ten chunks per page. Explicit event names ensure the schedule ID is encoded as an indexed RPC filter. Deduplicates by block hash/log index.
- Reports partial coverage and a pinned snapshot head; **Load next blocks** continues scanning, **Refresh history** obtains a new snapshot. RPC failures expose retry and preserve earlier loaded pages. Confirmed app transactions invalidate history.
- The deployment start block is guarded against use with a different contract. A future deployment needs its own verified start block.
- Verified: 14 browser tests, 4 accounting tests, TypeScript and production build passed. The existing bundle-size warning remains. Browser fixtures use both saved real histories and cover ordering, duplicates, exact cancellation/claim amounts, downloads, indexed filters, chunk boundaries, pagination, retry and mobile width.
- Read-only live browser check found all four saved events for each of schedules 1 and 2. First-page coverage was `16083735–16093734`, correctly marked partial against snapshot heads `16094162` and `16094164`. No wallet transactions were requested. Mobile screenshot visually reviewed at `.tools/history-mobile.png` (ignored).

Implementation: `apps/web/src/history.ts`, `apps/web/src/TransactionHistory.tsx`; browser checks: `tests/history.spec.ts`.

Original feature requirements, now implemented:

For each schedule, show:

1. Funding transaction and amount.
2. Every claim, its amount and transaction link.
3. Cancellation, the refunded amount and transaction link.
4. Clearly ordered records with useful timestamps and explorer links.

Existing `ScheduleCreated`, `Claimed` and `Cancelled` events are already in `paymentsAbi`. The inspection script already reads them. Use schedule 1 and 2 as real fixtures and avoid requiring new wallet transactions for development.

Implementation considerations:

- Scan from the verified deployment block in RPC-sized chunks; handle pagination and RPC errors.
- Filter by contract and schedule ID, order by block/log position, and deduplicate records.
- Keep amounts as bigint until formatting; preserve 18-decimal accuracy.
- Avoid labelling a bounded or incomplete scan as complete history.
- Provide loading, empty and retry states; show event evidence rather than invented transaction records.
- Add meaningful browser checks for funding/claims/cancellation history and reconcile against the saved real events.

### CSV export and pending-transaction recovery (deployed October 11)

The user approved implementation and deployment. Commit `6f3b9be` deployed successfully as `dpl_ArwrMycSWXSGEdmqYwfNxks9GyGe` at the existing public URL. Public checks verified full history and CSV/JSON downloads for both schedules through snapshot heads 16094553/16094556. The production recovery panel restored an already confirmed claim across reload, validated it and cleared tracking after acknowledgement; no new transaction was sent.

- **Export loaded history (CSV)** downloads exact formatted MUSD and raw base-unit strings, event/account/transaction/block identifiers, explorer links, UTC timestamps and scan coverage. Partial filenames and per-row metadata identify incomplete scans. Load all blocks for a complete snapshot. Spreadsheet software can round numeric cells when importing, although the CSV file itself retains all digits.
- Approval, funding, claim and cancellation hashes are saved immediately after wallet submission, before waiting for confirmation. Storage is scoped to chain/deployment; submitted address, target and calldata are retained for receipt checks. Storage availability is checked before signing.
- Reloading shows a saved-transaction panel without requiring wallet reconnection. It polls receipts, validates sender/target/calldata/value, distinguishes confirmed, reverted, unknown and differing replacement transactions, and offers the newly funded schedule link when available.
- New submissions pause while a saved transaction is tracked. Acknowledging a checked result refreshes balances/schedules/history. Recovery never signs or resubmits. Recovered approvals require returning to the form and a fresh funding signature/start time.
- Active waits persist replacement hashes through viem's replacement callback. Replacements occurring while the app is closed cannot always be discovered from the old hash; missing receipts remain explicitly unknown. Users can remove a stale tracking record after a confirmation explaining that this does not cancel the transaction and that resubmission may duplicate payment.
- Storage is specific to the browser/origin: localhost and the production site have separate records. Closing before the wallet returns a submitted hash, clearing site storage or switching browsers cannot be recovered by this mechanism. No private keys are stored.
- Validation: 26 browser tests, 4 accounting tests, TypeScript and production build passed. Tests include CSV precision/coverage, pending/success/revert/approval/funding/cancellation/RPC-error/mismatched receipt states, corrupt/foreign storage, and simulated claim/approval submissions surviving reload with zero repeated signing calls. No real wallet transactions were requested.

Implementation: `apps/web/src/pending.ts`, `apps/web/src/PendingTransactionPanel.tsx`, transaction integration in `App.tsx`, CSV helper in `history.ts`; recovery tests in `tests/recovery.spec.ts`.

### Read-only Mezo borrowing (deployed October 11)

The user requested moving to the next feature after deploying CSV/recovery. The borrowing reader and dashboard were deployed from commit `15785c5`, production deployment `dpl_8Ysdu58dE9StFYG1V5RxSAuPKXpb`, READY at the existing public URL. Public browser checks verified both accounts, no page errors and no mobile overflow. Details, pinned source links and addresses are in `docs/borrowing.md`.

- `packages/mezo/src/borrowing.ts` reads verified testnet proxies, checks implementation slots and token/price/oracle bindings, pins all position/price reads to one block, and reconciles the protocol collateral ratio.
- `apps/web/src/BorrowingPosition.tsx` shows collateral, total protocol debt including accrued interest, fixed annual interest, price and liquidation threshold. It reads the connected wallet or any manually entered public address. It never signs borrowing/repayment transactions.
- Stale/invalid prices hide loan health while preserving verified debt. Failed refreshes explicitly label historical data and hide health. Proxy upgrades require reverification. Nonexistent and closed positions have distinct states.
- Official `getEntireDebtAndColl` returns totals already including redistribution. Use collateral/principal/interest once; do not add the pending components again. The fixed annual rate is in basis points. The native oracle uses 18 decimals and reports answeredInRound=0.
- Same-reader RPC evidence: `deployments/mezo-testnet.borrowing.check.json`. Founder at block 16094640: 0.035 BTC collateral, 2001.835158580904771791 MUSD total debt, 0.035158580904771791 MUSD accrued interest, 1% rate. Contractor at block 16094641: no position. These are historical observations. Debt includes a 200 MUSD protocol gas reserve and is not a repayment quote.
- Live local browser check at block 16094671 showed the founder position and 144.7162% collateralization, then correctly switched to the contractor's no-position view at block 16094672. No page errors or horizontal mobile overflow; no new wallet transactions. Evidence and screenshot are ignored at `.tools/borrowing-browser.check.json` and `.tools/borrowing-mobile.png`.
- Validation: 17 unit/accounting tests and 36 browser tests pass, along with TypeScript and the production build. Existing bundle-size warning remains.

### BTC price stress simulator (deployed October 11)

The user requested the next recommended feature. `BorrowingStress.tsx` now displays a 0–100% BTC price-drop slider, preset scenario table and estimated threshold BTC price using the verified active position. `packages/mezo/src/stress.ts` uses bigint arithmetic, upward threshold rounding and exact threshold classification. Snapshot collateral and total debt stay fixed; no future interest or system-wide liquidation modelling. The simulator hides with stale/invalid prices or failed reads, disappears for inactive positions and resets on account changes.

Validation: 21 unit/accounting tests, all 10 borrowing browser cases, TypeScript and production build passed. The existing bundle warning remains. A live local browser check at block 16094855 showed the founder's 144.7665% baseline ratio, 115.8132% at a 20% drop and 72.3832% at a 50% drop. Estimated threshold price was 62914.85 USD, rounded upward to cents. These are historical scenarios, not live quotes. Switching to the contractor at block 16094856 removed the simulator. No page errors, mobile overflow or new wallet transactions. Mobile screenshot visually inspected. Ignored evidence: `.tools/borrowing-browser.check.json`, `.tools/stress-mobile.png`.

The simulator was deployed at the user's request from commit `074ce53`, production deployment `dpl_Chmxg3oKCkU4Mr58qPDowAUEEMNq`, READY at the existing public URL. Public browser verification at block 16094913 confirmed the founder scenarios, a 50% drop below the threshold, and the contractor's no-position state with the simulator absent. No page errors, mobile overflow or new transactions.

### Complete schedule pagination (deployed October 11)

After the simulator deployment, the user requested schedule pagination. `apps/web/src/schedules.ts` and the infinite query in `App.tsx` now load 20 IDs per direction per page with no total discovery cap. All pages share one source block. Sent and received offsets advance independently, exhausted directions stop, and merged rows are deduplicated and sorted by ID. Failed ID/detail pages preserve loaded rows and expose a retry button without skipping offsets. Refresh obtains a new head and refreshes loaded pages together; failed refreshes label retained snapshots. Direct schedule links remain available without a wallet.

Funded obligations now count only the connected account's sent schedules, using cancellation entitlement and subtracting claims. Partial discovery is explicitly labelled as a subtotal. Coverage displays unique schedule count, source block/time and partial/complete state. See `docs/schedule-pagination.md`.

Validation: all 42 browser tests, 21 unit/accounting tests, TypeScript and production build passed. Six new pagination cases include 121 sent + 22 received IDs (141 unique), cross-page overlaps, retries for ID/detail failures, exact page boundaries, empty accounts, refreshed snapshots, failed refreshes and account changes. Live local browser reads reconciled schedules 1/2 for the founder at block 16094995 and contractor at block 16094996. No page errors, mobile overflow, signing or transactions. Mobile screenshots visually inspected. Evidence: ignored `.tools/schedules-browser.check.json`, `.tools/schedules-mobile.png`, `.tools/schedules-live-mobile.png`. Existing bundle warning remains.

Pagination was deployed at the user's request from `5bfc3d9`, production deployment `dpl_H7pmgZy2eM5L922hodW5FoKyL5UQ`, READY at the existing public URL. Public browser checks reconciled schedules 1/2 for both accounts at block 16095225 with no page errors, mobile overflow or new transactions.

### Explorer source verification (completed October 11)

The user requested beginning the next step after deploying pagination. RunwayPayments is now exact-match verified on the public Mezo testnet explorer. Blockscout confirmed full verification at `2026-10-11T04:46:08.009609Z`; API fields are verified=true, fullyVerified=true, partiallyVerified=false. Public browser page confirmed the exact-match banner, source, ABI, Solidity 0.8.28, London, 200 optimizer runs and official MUSD constructor. No new blockchain transactions.

Reproduction: `node scripts/verify-explorer.mjs` checks without submission; `--submit` publishes matching public source. The script generates standard JSON and verifies every source hash against the original metadata, original source/creation hashes, indexed successful creation transaction and live RPC code. The RPC returned no old creation receipt during this session, so indexed creation evidence was used. Initial automatic approval review rejected publication as nonpublic source; unauthenticated GitHub checks proved all seven exact files already public, after which the same submission was approved. No action remains blocked.

Evidence: `deployments/mezo-testnet.explorer.check.json`, `deployments/verification/RunwayPayments.standard-input.json`, `deployments/verification/public-source-check.json`; source license notices and official `OpenZeppelin.LICENSE` preserved. Blockscout's separate license metadata is `none`, while source SPDX declarations are MIT. Details: `docs/explorer-verification.md`. Ignored public browser screenshot: `.tools/explorer-verified.png`.

### Adversarial/stateful contract security tests (completed locally October 11)

The user requested the next security step. Added `contracts/test/RunwaySecurity.t.sol` (12 adversarial cases) and `contracts/test/RunwayInvariant.t.sol` (two independent-model invariant campaigns plus a deterministic handler exercise). `contracts/foundry.toml` now sets invariant runs=128, depth=128 and fail_on_revert=true. All 24 Solidity tests pass, including the original 256-case accounting fuzz test. Each invariant made 16,384 handler calls with zero unexpected reverts/discards.

Adversarial cases test all nine cross-entry reentrancy combinations, fee/short funding, false/reverting transfers with full rollback/retry, caller-independent recipient-only claims, claim/cancel ordering, donations, no-return ERC-20 behavior, overflowing intermediate vesting arithmetic, invalid inputs/IDs and pagination over 100 IDs. The stateful handler models up to 32 schedules across three actors, tracking deposits, claims, refunds and donations independently of contract state. Invariants check escrow/obligation/global actor conservation, immutable fields, freeze/rounding behavior and discovery. `afterInvariant` advances through all ends and pays every remaining entitlement, proving zero obligations and only donated surplus remains. CI already runs these tests.

Evidence: `deployments/security-tests.check.json`; details and limits: `docs/security-testing.md`. Final-run source SHA-256 and creation-bytecode hash match the original deployment. No production source/frontend changes or blockchain transactions. The user requested committing and pushing the tests, verification evidence and documentation to main; inspect git status/log for publication status. CI runs the full test suite, and the GitHub integration rebuilds the frontend on a main push. Ignored runner/raw output: `.tools/run-security-check.mjs`, `.tools/security-tests.raw.json`.

Next: demo/submission materials and release review. Borrowing and repayment should remain in Mezo until intentionally integrated. Do not estimate debt from wallet MUSD. These local tests and exact source verification are not an independent audit.

## 9. Files to read or edit next

| File | Purpose |
| --- | --- |
| `apps/web/src/App.tsx` | Current dashboard, funding form, schedule reads, claims and cancellation UI |
| `apps/web/src/Sidebar.tsx`, `apps/web/src/Router.tsx` | Shared navigation order, Documentation footer and client-side route/history handling |
| `apps/web/src/Borrowing.tsx`, `apps/web/src/BorrowingPosition.tsx`, `apps/web/src/BorrowingStress.tsx` | Dedicated read-only borrowing page, position reads and BTC price scenarios |
| `tests/navigation.spec.ts`, `tests/borrowing.spec.ts` | Sidebar/no-reload navigation, direct borrowing routes/refresh and borrowing-state regression cases |
| `apps/web/src/Workspace.tsx` | Wallet login, private workspaces, contractors and draft invoices |
| `apps/api/src/app.ts`, `apps/api/src/db.ts`, `apps/api/src/server.ts` | Hono API, pooled MongoDB/indexes and Render listener |
| `docs/backend.md`, `docs/render-hosting.md` | Backend configuration and actual hosted service settings |
| `docs/development-workflow.md` | Expanded Wave 1 and Wave 2 roadmap |
| `deployments/render-backend.check.json` | Latest hosted browser/API/Atlas verification evidence |
| `tests/workspace.spec.ts`, `apps/api/src/app.test.ts` | Workspace browser and API regression coverage |
| `apps/web/src/WalletConnection.tsx` | Wallet discovery and selection |
| `apps/web/src/config.ts` | Public configuration and wagmi setup |
| `apps/web/src/style.css` | Responsive styling |
| `apps/web/src/Documentation.tsx`, `apps/web/src/guide.ts` | Public documentation page and shared guide content |
| `docs/user-guide.md`, `scripts/export-user-guide.mjs` | Generated repository guide; regenerate with `pnpm docs:generate` |
| `packages/mezo/src/index.ts` | Chain definition, payment ABI and calculation helpers |
| `contracts/src/RunwayPayments.sol` | Deployed payment rules |
| `contracts/test/RunwayPayments.t.sol` | Contract tests |
| `scripts/inspect-schedule.mjs` | Read-only schedule and event inspection |
| `scripts/verify-frontend.mjs` | Public browser verification; writes a tracked report/screenshot |
| `tests/settlement.spec.ts` | Deterministic RPC fixtures for settlement displays |
| `tests/browser.spec.ts`, `tests/wallets.spec.ts` | Other browser tests |
| `.github/workflows/checks.yml` | GitHub CI; copies public `.env.example` before checks |
| `vercel.json`, `render.yaml`, `scripts/configure-api-proxy.mjs` | Vercel build/routes/API proxy, intended Render Blueprint and proxy configuration helper |
| `README.md`, `docs/frontend-hosting.md` | Setup and current deployment workflow |
| `docs/test-results.md` | Test history; later sections/updates supersede earlier pending statements |
| `wave1Steps.md`, `plan.md`, `issues.md` | Broader project plan and prior review |

## 10. Useful commands

Use Node 24 and pnpm 10.34.6. pnpm is not necessarily installed globally on this machine; the npm wrapper works:

```powershell
# Fresh clone only: install dependencies and create local public configuration.
npm exec --yes --package=pnpm@10.34.6 -- pnpm install --frozen-lockfile
# Copy only if .env does not already exist; preserve existing local settings.
if (-not (Test-Path .env)) { Copy-Item .env.example .env }

# Local development.
npm exec --yes --package=pnpm@10.34.6 -- pnpm dev

# Checks appropriate to the next implementation change.
npm exec --yes --package=pnpm@10.34.6 -- pnpm typecheck
npm exec --yes --package=pnpm@10.34.6 -- pnpm test
npm exec --yes --package=pnpm@10.34.6 -- pnpm test:browser
npm exec --yes --package=pnpm@10.34.6 -- pnpm build
npm exec --yes --package=pnpm@10.34.6 -- pnpm test:contracts

# Read-only chain inspection; rebuild contract artifacts first on a fresh clone.
npm exec --yes --package=pnpm@10.34.6 -- pnpm build:contracts
node scripts/inspect-schedule.mjs 1
node scripts/inspect-schedule.mjs 2
node scripts/verify-frontend.mjs
```

The inspection/verification scripts update evidence files; review their diffs before committing. Native Foundry runs through `scripts/forge.mjs`; WSL was unavailable and is unnecessary.

In the previous agent environment, default shell sandbox setup repeatedly failed with `helper_unknown_error`; reviewed `require_escalated` shell calls worked. That was a tool-environment issue, not a project build failure. Reassess current permissions rather than assuming an old session's tools remain running or authenticated.

## 11. Boundaries and context to preserve

- Testnet assets only; no mainnet release has been requested.
- Never request, export or commit private keys, seed phrases or authentication tokens.
- `.env`, `.tools`, `.publish`, `.vercel`, dependencies, generated builds, Foundry outputs and browser traces are ignored.
- Keep deployment evidence distinct from explorer source verification and an audit.
- Implementation started October 10, before the brief's October 16 build start. Organizer approval for early implementation remains unconfirmed; recorded in `docs/buildathon.md`.
- Do not mark all of Wave 1 complete: history/receipts, CSV/recovery, borrowing reads, price-stress scenarios and pagination are deployed; explorer verification and local adversarial/stateful tests are complete; submission materials, release review and external confirmations remain.

## User documentation deployed (October 11)

Added a wallet-free `/docs` page linked from the app sidebar, covering setup, founder funding, contractor claims, cancellation with a worked example, paginated overview, history/JSON receipts/CSV, read-only borrowing/scenarios, pending recovery and release limits. Shared content in `apps/web/src/guide.ts` powers both the page and Markdown download; `pnpm docs:generate` writes `docs/user-guide.md` through `scripts/export-user-guide.mjs`. README links to the user guide. Vercel rewrites now include `/docs` and `/docs/` for direct visits.

Validation: production TypeScript/Vite build passed. Local production-preview browser checks passed for both documentation routes, anchor links, identical Markdown download, navigation to/from New schedule, 390px/320px layouts without overflow, and no page errors. Documentation made no Mezo RPC requests and required no wallet. Desktop/mobile screenshots were visually inspected. Ignored checker/screenshots: `.tools/verify-user-guide.mjs`, `.tools/user-guide-desktop.png`, `.tools/user-guide-mobile.png`.

Committed and pushed as `b309e7b`, then deployed through the normal GitHub `main` workflow as `dpl_EMyR7AMmss43ipT1xsAwPDqd4ijS`. The public `/docs` and `/docs/` page checks, Markdown download and navigation passed, including mobile layouts and no page errors. The fallback static-hosting preparation also includes both docs routes. Payment contract and transaction behavior were not changed. The full GitHub browser-test step subsequently failed; investigate it next session before further release work.

## Next-session priorities

1. Inspect `git status` and read the latest Ask Runway entry, `docs/ai-assistant.md`, `docs/assistant-knowledge.md` and the assistant configuration in `docs/backend.md`. Production frontend and backend are reconciliation release `a95c4a9`. Assistant Phase 1 is implemented locally, verified, uncommitted and undeployed. Preserve all source changes, new files and prior release records. Do not redeploy just to recover context.
2. Complete real installed-wallet login on the hosted `/workspace` page when the user is available. Generated-wallet hosted signing is verified; existing two-wallet financial tests are already complete and need not be repeated.
3. When Dashboard access is available, set Render HTTP health check to `/api/health` and deliberately decide whether to move its source branch to `main` and gate auto-deploy on passing checks. The current service uses TCP checks and commit-triggered deploys on the deployment branch. Free Render can sleep; account for a slow first request during demos.
4. For assistant review, check whether http://127.0.0.1:5174/assistant is still available. If needed, run `node --env-file=.env .tools/assistant-preview.mjs`; it uses real Gemini and an isolated temporary database. Restart it after backend changes. Root `.env` contains the user's authorized Gemini key; preserve it and never print or commit it. The AI-readable knowledge file is public product information only. Phase 2 wallet/transaction reads and Phase 3 confirmed actions remain future work.
5. When an assistant release is requested, review the diff and explicitly include new untracked assistant source, tests and knowledge/scope files. Configure the Gemini key securely in Render's server environment; it is not uploaded from local `.env`. Deploy the backend on `deploy/render-backend-2026-10-13`, verify allowed Origin, usage limits and the actual Vercel proxy → API → Gemini → cited-answer flow, then release the frontend. Preserve the enabled payment indexer. Main pushes trigger Vercel immediately and do not update the Render backend. No assistant commit/push/deployment has occurred. Demo/submission materials and external confirmations remain.
6. Historical CI failure 38117460629 can be investigated if useful; deployed reconciliation CI is green. Assistant validation is local: 52 unit/API tests, 53 browser cases, 18 live routing evaluations, real Gemini browser verification, TypeScript, build, formatting and whitespace. Preserve the Vite viem deduplication and shared Zod 4.6.5 pin that resolved recovery regressions. Keep historical, local and hosted evidence separate.

## Local saved state after deployment

The user requested this handoff-only update after local assistant implementation. `main` remains at released reconciliation commit `a95c4a9`. Reconciliation is committed, pushed and deployed on both hosting targets; embedded indexing is enabled. Assistant source, dependency/lockfile changes, UI/navigation/routes, configuration examples, tests, user guide and scope/knowledge documentation remain local changes. New untracked implementation files are `apps/api/src/assistant.ts`, `assistant-knowledge.ts`, `assistant.test.ts`, `apps/web/src/Assistant.tsx` and `tests/assistant.spec.ts`; new untracked docs are `docs/ai-assistant.md` and `docs/assistant-knowledge.md`. Preserve the earlier release-record changes, including untracked `deployments/reconciliation-release.check.json`. Ignored `.tools/` helpers, reports and screenshots contain local verification evidence. The preview was started on port 5174; check availability rather than assuming the process survives into another session. No tests were rerun, and no commit, push, deployment, provider configuration or transaction is part of this handoff-only update. Never commit `.env`.

## Suggested prompt for the next session

> Read HANDOFF.md and inspect git status. Production frontend and Render backend are reconciliation release a95c4a9; Render follows deploy/render-backend-2026-10-13 and embedded payment indexing is enabled. Ask Runway Phase 1 is implemented locally, uncommitted and undeployed. It has a simple /assistant chat page, server-side Gemini using the authorized root .env key, a reviewed docs/assistant-knowledge.md collection, isolated scope/answer calls, validated sources, fixed refusals, bounded question-only follow-up context and durable usage limits. It has no wallet, private workspace, RPC or transaction tools. All 52 unit/API tests and 53 browser cases passed, along with TypeScript, build, formatting and whitespace; 18 live routing evaluations and the real Gemini browser flow passed. Public assets contain no server credentials. Read docs/ai-assistant.md and docs/backend.md. Preserve all local changes, untracked files, release evidence, .env and the existing payment contract. Check the optional isolated-database preview on port 5174 before restarting it. Real installed-wallet login remains pending. Continue the user-selected task; do not commit, deploy or repeat financial transactions just to recover context.

## Render deployment session — October 13, 2026 (completed; see current status above)

User authorized deploying the prepared backend to Render while retaining the Vercel frontend. Release checks passed again: 30 unit/API tests, 44 browser tests, TypeScript, formatting, build and git diff whitespace. Prepared source committed and pushed to `deploy/render-backend-2026-10-13` as `023087f`; the frontend/proxy release subsequently advanced main to `727dd13`. Local MongoDB URI is present; no URI appears in frontend build assets. Never print the URI.

User confirmed My Workspace (`tea-d7p2hoa8qa3s73et5nl0`). Created free Singapore Node service `runway-api`, ID `srv-db75jus9v7es73ai4g00`, URL https://runway-api-rw61.onrender.com. Deployment `dep-db75jvs9v7es73ai4ibg` is live from backend commit `023087f` on `deploy/render-backend-2026-10-13`. MongoDB values transferred directly from ignored local `.env`; APP_ORIGIN is the existing Vercel production origin. Direct HTTPS `/api/health` returned 200 ready/database connected; logs confirm 0.0.0.0:10000 startup. Created with the MCP tool, so it uses commit-triggered auto-deploy on the deployment branch and default TCP health checks (MCP cannot set an HTTP health path); `render.yaml` describes the intended Blueprint settings, not an applied Blueprint. Browser UI was unavailable to adjust this. HTTP health is verified explicitly.

Vercel MCP still returns 404 for the known project. Authenticated CLI 54.9.1 successfully inspected `supunthks-projects/mezo-runway-testnet` and confirmed project `prj_xVu0NEGFRc47pJFYnZI87erHvqoX`, Node 24.x and existing build settings. The real Render proxy URL is configured and production deployed. Use the CLI fallback or Git main workflow for future authorized frontend releases.

Ignored `.tools/verify-render-release.mjs` is prepared and syntax checked. It exercises the real HTTPS frontend/API/Atlas with newly generated test-wallet message signatures, checks Secure/HttpOnly/SameSite=Strict cookies, persistence, owner isolation, replay rejection, exact payment prefilling and logout. It removes only its own generated wallet records. It ran successfully against the deployed frontend/API/Atlas; see the deployment evidence above. Real installed-wallet extension signing remains a separate user validation. Historical CI failure 38117460629 is still uninvestigated (`gh` is unavailable); both current source/release CI runs passed, verified through the public GitHub API.
