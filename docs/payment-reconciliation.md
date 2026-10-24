# Payment reconciliation

Released October 17, 2026 as `a95c4a9` on both production frontend and Render backend. Embedded indexing is enabled on the existing free Render service and initial catch-up is complete. The normal worker retains 500-block batches; one-time release backfill also used the indexer's supported 5,000-block bound. Hosted API checks and read-only snapshot/accounting comparisons passed. See [release evidence](../deployments/reconciliation-release.check.json) and the latest entry in [HANDOFF.md](HANDOFF.md).

Invoice reconciliation reads the existing Mezo testnet payment contract. It does not change contract rules or submit transactions. New invoice payment links include a random 32-byte reference; names, descriptions and invoice IDs are not published onchain. Automatic matches require that reference, the workspace owner as sender, the saved recipient and the exact invoice amount in MUSD base units.

Existing invoices without references can use **Link existing schedule**. The authenticated owner supplies a schedule ID; the server verifies the indexed chain/contract, sender, recipient and original total. A legacy schedule with a zero reference can be linked to one invoice only, across all workspaces. A nonzero reference must belong to the invoice. Repeating the same link is safe. A different schedule cannot replace an existing manual link.

## Invoice payment states

The stored business-record status remains `draft`; the invoice-list response adds a separate derived `payment` object. Contract funding is not treated as recipient payment.

| Payment status | Meaning |
| --- | --- |
| `draft` | No matching confirmed schedule |
| `funded` | Exact invoice amount committed to a schedule; nothing claimed yet |
| `partially_claimed` | Recipient has received some MUSD |
| `paid` | Recipient has claimed the entire invoice amount |
| `cancelled` | Accrual stopped; claimed, refund and remaining entitlement are shown separately |
| `conflict` | Multiple schedules from the owner use the reference; explicitly link the intended schedule |
| `awaiting_confirmation` | Manually linked schedule is absent from the current canonical snapshot |
| `unavailable` | Indexing is missing, behind, failed, rebuilding or over two minutes old |

Amounts are decimal strings in base units in the API and formatted with 18 decimals in the UI. Remaining entitlement is total minus claimed, or vested-at-cancellation minus claimed after cancellation. It includes future accrual and is not a claimable-now quote. The UI refreshes invoice lists every 15 seconds while active and has a manual refresh action. Request failures hide cached payment evidence. The schedule page remains the place to inspect current contract state and transact.

## Running the indexer

Use Node 24 and the existing server-only MongoDB configuration. The indexer is disabled by default. Choose either mode:

- Set `PAYMENT_INDEXER_ENABLED=true` in the API environment to run the loop with the existing web service.
- Run `pnpm --filter @runway/api index:payments` as a separate long-lived process. Append `--once` for one bounded batch.

`INDEXER_RPC_URL` optionally overrides the default Mezo testnet RPC. The endpoint must support historical event queries and `eth_call` at checkpoint blocks. No private key is used. Do not point test fixtures at the production database.

Each iteration verifies chain 31611, the deployed bytecode hash and MUSD token from `deployments/mezo-testnet.payments.json`. It reads up to 500 blocks starting at deployment block 16083735, retaining a 12-block confirmation buffer. The buffer is an application policy, not a guarantee of irreversible finality. RPC tips older than five minutes are rejected. Errors retry with bounded exponential delay; successful iterations run five seconds apart. Initial catch-up of the current deployment needs many batches. The API will report unavailable until the checkpoint reaches the confirmed tip.

`paymentIndex` stores the durable checkpoint and a two-minute fenced lease. Each batch deduplicates logs by transaction hash/log index, records them in `paymentEvents`, reads affected schedules at one block and writes an immutable generation to `paymentSchedules`. It checks the old and new checkpoint hashes again before atomically publishing the generation pointer. Failed or interrupted work is never published; a replacement process resumes from the last published checkpoint. Competing or expired lease holders cannot publish over the active worker.

On a checkpoint hash mismatch, or a restart after snapshot retention may have expired, the indexer hides payment evidence and rebuilds from the deployment block. Removed claims and schedules disappear when the new canonical generation is published. Snapshot generations have a 24-hour cleanup TTL; event records are retained for audit, including unpublished/orphan generations. The generation pointer identifies published snapshot evidence, so unreferenced event rows must not be treated as canonical payment history.

This implementation copies the small deployed schedule set into each generation. Revisit snapshot storage and event retention before growing to large schedule volumes. A single batch that exceeds the lease time fails safely and must be split into smaller ranges in code before retrying at that scale.

## API and hosting

`GET /api/workspaces/:workspaceId/invoices` retains pagination and adds `payment` per invoice plus `reconciliation` metadata (availability, checkpoint, check time, chain and contract). `POST /api/workspaces/:workspaceId/invoices/:invoiceId/payment` accepts `{ "scheduleId": "1" }` for explicit linking. It requires the existing session, exact Origin and workspace ownership, and rejects stale evidence or mismatches. Unique indexes prevent schedule reuse and reference collisions.

Deploy API changes and initialize indexes before publishing the new frontend. The live Render service currently follows `deploy/render-backend-2026-10-13`, not `main`; coordinate that branch deliberately. Enable the indexer only after the new backend code is deployed. A free Render web service sleeps when idle, so embedded indexing pauses; stale status is expected until wake-up and catch-up. A continuously running separate worker is needed for continuous reconciliation. No hosting changes or production data writes are part of local implementation validation.

Validation includes isolated MongoDB API/indexer tests, a simulated-wallet browser flow through real API/database boundaries, and read-only live RPC checks of bytecode/token identity, historical events and schedule state. No real funding, claim or cancellation is needed to test this increment.
