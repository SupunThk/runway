# Schedule discovery and pagination

Deployed October 11, 2026 from `5bfc3d9`, production deployment `dpl_H7pmgZy2eM5L922hodW5FoKyL5UQ`, READY at the existing public Runway URL. Public browser checks reconciled schedules 1 and 2 for both accounts at block 16095225 with no page errors, mobile overflow or new transactions.

The overview reads 20 sent IDs and 20 received IDs per page through the deployed contract's offset/limit getters. **Load more schedules** continues whichever direction still has results. Each direction advances by its raw returned count, independently of deduplication. Fewer than 20 IDs ends that direction; exactly 20 requires another read, which may be empty. There is no total discovery cap.

The first page obtains the source block and chain timestamp. All subsequent ID, schedule and claimable reads use that same block. This avoids mixing discoveries or entitlements from different snapshots. Results are merged by schedule ID and sorted in ascending ID order; a schedule appearing in both directions is rendered and counted once.

The UI reports the source block, UTC timestamp, unique loaded count, and partial or complete coverage. Complete means all sent and received IDs at that snapshot, not every account's schedules or future discoveries. The funded-obligations metric sums only loaded schedules sent by the connected account, subtracting claimed amounts and using vested entitlement for cancelled schedules. It is explicitly labelled a partial subtotal while additional pages remain. Direct schedule views label that metric as applying only to that schedule.

ID or detail-read failures do not advance the cursor or append an incomplete page. Earlier pages remain visible, an alert describes the failure, and **Retry loading more schedules** retries the same page. Initial-load failures can be retried with **Refresh**. Refresh failures retain and label the previous snapshot.

Manual refresh, the existing 15-second polling interval and confirmed app transactions refresh the loaded pages sequentially against a new first-page block. TanStack Query commits the refreshed pages together; a failure retains the previous result. Newly appended IDs may require loading more pages. The query is scoped to testnet, RPC URL, payment contract, account, wallet chain and optional direct schedule ID. Account/chain changes switch queries rather than retaining the previous account's rows. A direct link reads one schedule without requiring an account or enumerating lists.

Implementation: `apps/web/src/schedules.ts`, `apps/web/src/App.tsx`. Browser verification: `tests/schedules.spec.ts`. No contract changes, extra wallet permissions or new transactions are required.

## Verification

All 42 browser tests and 21 unit/accounting tests passed, along with TypeScript and the production build. Six pagination cases cover 121 sent and 22 received IDs (141 unique schedules), cross-page and cross-direction duplicates, sender-only obligations with cancellation accounting, partial totals, independent offsets, one-block reads, exact page boundaries, empty lists, ID/detail errors and retry, refresh failures, refreshed snapshots, account changes, direct links, and mobile width.

A live local browser check reconciled schedules 1 and 2 for both existing accounts with independent contract getter reads. Founder snapshot: block 16094995; contractor snapshot: block 16094996. No uncaught page errors, horizontal mobile overflow or wallet signing requests. These two real schedules do not exercise large account pagination; the deterministic fixtures provide that coverage. Mobile screenshots were visually inspected. Ignored reports/screenshots are under `.tools/`.
