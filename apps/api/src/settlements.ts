import { MongoServerError, type Db } from 'mongodb';
import { HTTPException } from 'hono/http-exception';

export type SettlementTarget = {
  targetType: 'invoice' | 'payment-request';
  targetId: string;
  workspaceId: string;
};
type Claim = SettlementTarget & { _id: string; createdAt: Date };
const same = (claim: SettlementTarget, target: SettlementTarget) =>
  claim.targetType === target.targetType &&
  claim.targetId === target.targetId &&
  claim.workspaceId === target.workspaceId;

export async function reserveSettlement(
  db: Db,
  key: string,
  target: SettlementTarget,
  now: Date,
) {
  // Also fence historical invoices before a later release has backfilled every claim.
  const old = await db
    .collection<{ _id: string; workspaceId: string; paymentKey?: string }>(
      'invoices',
    )
    .findOne({ paymentKey: key });
  if (
    old &&
    !same(
      {
        targetType: 'invoice',
        targetId: old._id,
        workspaceId: old.workspaceId,
      },
      target,
    )
  )
    throw new HTTPException(409, {
      message:
        'This payment is already linked to another record. Do not send another payment.',
    });
  try {
    await db
      .collection<Claim>('settlementClaims')
      .insertOne({ _id: key, ...target, createdAt: now });
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000)
      throw error;
    const existing = await db
      .collection<Claim>('settlementClaims')
      .findOne({ _id: key });
    if (!existing || !same(existing, target))
      throw new HTTPException(409, {
        message:
          'This payment is already linked to another record. Do not send another payment.',
      });
  }
}
export async function ownsSettlement(
  db: Db,
  key: string,
  target: SettlementTarget,
) {
  const claim = await db
    .collection<Claim>('settlementClaims')
    .findOne({ _id: key });
  return Boolean(claim && same(claim, target));
}
export async function backfillSettlements(db: Db) {
  const records = db
    .collection<{ _id: string; workspaceId: string; paymentKey: string }>(
      'invoices',
    )
    .find({ paymentKey: { $exists: true } });
  for await (const row of records)
    await reserveSettlement(
      db,
      row.paymentKey,
      {
        targetType: 'invoice',
        targetId: row._id,
        workspaceId: row.workspaceId,
      },
      new Date(),
    );
}
