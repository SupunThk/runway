# MongoDB backend

Runway's backend stores business records. Wallets and the existing payment contract authorize and settle financial transactions.

## Configuration

Add these entries to the existing root `.env`:

```dotenv
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/?retryWrites=true&w=majority
MONGODB_DATABASE=runway
APP_ORIGIN=http://127.0.0.1:5173
API_PORT=3001
```

Replace the URI with your own connection string; URL-encode special characters in credentials. Use a database user restricted to the Runway database and permit the development/deployment network in MongoDB Atlas. These are server-only settings: never add `VITE_` to their names. Do not replace existing public chain settings or commit `.env`.

No separate session signing secret is needed: sessions use random 256-bit tokens, with SHA-256 hashes stored in MongoDB. No private key is requested or stored.

Use Node 24 and pnpm 10.34.6. `pnpm dev` starts both services. `pnpm dev:api` and `pnpm dev:web` start them separately. When using the npm wrapper, prefix commands with `npm exec --yes --package=pnpm@10.34.6 --`.

The default proxy targets port 3001. If you change API_PORT, also change the Vite proxy target. Keep browser hostname/port consistent with APP_ORIGIN. Missing or unreachable MongoDB returns a controlled 503; existing public schedule reads and claims remain independent of this backend.

## API

All routes are under `/api`. POST bodies are JSON, capped at 16 KiB. Mutations require an exact Origin match. Cookies are HTTP-only, SameSite=Strict, path `/api`, and Secure on HTTPS. Responses are not cached; no cross-origin API access is enabled.

| Method/path | Behavior |
| --- | --- |
| GET `/health` | Checks MongoDB availability; 200 ready or 503 unavailable |
| POST `/auth/challenge` | `{address}` → domain/chain-bound SIWE message and nonce, expires after five minutes |
| POST `/auth/verify` | `{nonce, signature}` → verifies personal-wallet signature and sets one-day session |
| GET `/auth/session` | Returns authenticated wallet or 401 |
| POST `/auth/logout` | Revokes current session and clears cookie |
| GET/POST `/workspaces` | List own workspaces / create with `{name}` |
| GET/POST `/workspaces/:id/contractors` | List / create with `{name, address}` |
| GET/POST `/workspaces/:id/invoices` | List / create draft with `{contractorId, description, amount, dueDate}` |
| POST `/workspaces/:id/invoices/:invoiceId/payment` | Link a confirmed matching schedule with `{scheduleId}` |

Lists return `{items, nextCursor}` with at most 25 items. Pass `?after=<nextCursor>` for the next page. IDs are UUIDs, dates are ISO strings, and MUSD base units are decimal strings. Invoice `amount` is a positive decimal string with at most 18 fractional digits; `dueDate` uses YYYY-MM-DD. The server fixes status to `draft` and recipient to the saved contractor.

Workspaces are owner-only. Nested reads and writes verify ownership before accessing records; contractor references must belong to the same workspace. There are no invitations, contractor logins, edits or deletions yet. Invoice lists now derive payment evidence from confirmed indexed schedules, and owners can link existing matching schedules. See [payment reconciliation](payment-reconciliation.md) for states, indexer operation, reorg recovery and hosting. A draft is not proof of payment; repeatedly funding its prefilled form can create multiple schedules.

## Persistence and authentication

Reconciliation additionally uses `paymentIndex`, `paymentEvents` and `paymentSchedules`. Unique sparse indexes on invoice references and schedule links prevent duplicate associations. See the reconciliation guide for snapshot retention and worker leases.

Collections: `challenges`, `sessions`, `rateLimits`, `workspaces`, `contractors`, `invoices`. Indexes are initialized on first connection. Challenges/sessions/counters have cleanup TTL indexes; requests separately check expiration, so delayed TTL deletion cannot extend access. Contractor wallet uniqueness is enforced by a compound database index. Login challenges are consumed atomically after signature verification.

One MongoClient pool is reused per process, with bounded connection timeouts and retry after failed initialization. Auth throttles use shared MongoDB counters: ten challenges per wallet/minute, twenty verification attempts per wallet/minute, a 300-request global auth budget/minute, and sixty authenticated mutations per wallet/minute. These are application limits; production abuse controls and monitoring need release review.

Initial authentication supports EOA personal wallets, not smart-contract wallet signatures. Disconnecting a wallet does not revoke a server session; the page hides workspace access when the connected account does not match, and **Sign out of workspace** revokes the session. Sessions can also be revoked by removing their hashed records; expired sessions never authenticate.

## Assistant configuration (local implementation)

`POST /api/assistant/chat` accepts `{ "question": "…", "history": ["previous user question"] }`. It needs an exact allowed Origin, but no wallet login. Questions are limited to 1,200 characters and six previous user questions; extra fields and forged roles are rejected. The service never reads workspace records for assistant requests. MongoDB is required for durable anonymous usage counters.

Set server-only `GEMINI_API_KEY` in the existing root `.env` for development. `GEMINI_MODEL` defaults to `gemini-3.8-flash`, verified against the key's available model list during implementation. Set `ASSISTANT_ENABLED=false` to disable inference. `ASSISTANT_DAILY_REQUEST_LIMIT` defaults to 200 requests per UTC day and must be 1–10,000. This is a request cap, not a dollar-denominated provider budget; each accepted request uses at most two model calls, each capped at 2,200 output tokens, with no SDK retries. Failed calls still consume the request budget. Configure any additional billing controls in the provider account.

The service also limits requests to six/client hint/minute, thirty globally/minute, and two concurrent requests per process, with a 45-second inference deadline. Client IP headers are only an abuse hint; the global counters enforce the shared budget even if those hints are spoofed. Origins and IP hints do not authenticate private data. Counters use the existing `rateLimits` TTL collection. No raw prompts, answers or provider errors are logged; request IDs, outcomes, source IDs and duration are logged. The app does not persist chat transcripts; Google's separate processing/retention policies still apply.

Every inference starts with fresh system instructions. The scope router sees only bounded user questions and public source titles. The answer call sees only selected sections from [assistant knowledge](assistant-knowledge.md). It receives neither workspace sessions nor `.env` values, previous assistant replies or other users' conversations. It has no browsing, RPC, database or transaction tools. Model-generated source IDs are checked against retrieved sections; links come from an allowlist. Unsupported/out-of-scope/live-data requests receive fixed server replies. Complete structured responses are validated before display, rather than streaming unvalidated text. Scope classification remains model-based; automated and live evaluations are regression evidence, not a guarantee against every possible adversarial phrasing.

To release later, configure the Gemini key directly in Render's server environment without printing or committing it. Local `.env` is not uploaded. Deploy the backend branch and verify the real frontend Origin/proxy → model → cited-answer path before the frontend; `/assistant` and `/assistant/` rewrites are prepared. No production assistant release has been performed as part of local implementation. See [assistant scope](ai-assistant.md).

## Hosting configuration

The user selected Render for the Node API, retaining Vercel for the frontend and Atlas for MongoDB. See [Render deployment](render-hosting.md) for the root Blueprint, commands, secret configuration and frontend API proxy setup. The earlier Vercel function adapter has been removed. The actual Render service URL must be configured before publishing the frontend proxy.

Configure MONGODB_URI, MONGODB_DATABASE and APP_ORIGIN in Render; local `.env` is not uploaded. APP_ORIGIN is the exact frontend HTTPS origin, such as `https://mezo-runway-testnet.vercel.app`. Render's PORT controls the listener; local API_PORT remains supported. Preview origins require their own scoped backend/database configuration. Hosted routing, Secure/HttpOnly/SameSite=Strict cookies, wallet challenge signatures, Atlas persistence, account isolation, replay rejection and logout were verified October 13, 2026 using generated test wallets. See `deployments/render-backend.check.json`. Installed wallet-extension signing still needs user validation. Do not describe `pnpm build` as a backend deployment check.

Implementation references: [MongoDB connection pools](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/), [SIWE messages](https://viem.sh/docs/siwe/utilities/createSiweMessage), [Hono](https://hono.dev/docs/).
