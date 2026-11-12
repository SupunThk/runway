import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Db } from 'mongodb';
import { isAddress, parseUnits, zeroAddress, type Hash } from 'viem';
import { paymentDeployment } from './reconciliation.ts';
import { ownsSettlement, reserveSettlement } from './settlements.ts';
import type { TransferVerifier } from './direct-payments.ts';

export type PaymentRequest = {
  _id: string;
  workspaceId: string;
  token: string;
  recipient: string;
  amountBaseUnits: string;
  publicBusinessName: string;
  publicMemo: string;
  privateNote: string;
  clientLabel: string;
  createdAt: string;
  expiresAt: string;
  cancelledAt?: string;
  linkingHash?: Hash;
  transactionHash?: Hash;
  paymentKey?: string;
};
type Variables = { db: Db; address: string };
type Options = {
  now: () => Date;
  verify: TransferVerifier;
  rateLimit: (
    db: Db,
    key: string,
    max: number,
    now: Date,
    window?: number,
  ) => Promise<void>;
};
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fail = (status: 400 | 404 | 409 | 503, message: string): never => {
  throw new HTTPException(status, { message });
};
function text(v: unknown, field: string, max: number, optional = false) {
  if (optional && (v === undefined || v === '')) return '';
  if (typeof v !== 'string' || !v.trim() || v.trim().length > max)
    return fail(400, `${field} must contain 1–${max} characters.`);
  return v.trim();
}
async function json(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return fail(400, 'Send application/json.');
  try {
    const value = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    return fail(400, 'Invalid JSON body.');
  }
}
const keyFor = (hash: Hash) =>
  `${paymentDeployment.chainId}:${paymentDeployment.token}:${hash}`;
const targetFor = (row: PaymentRequest) => ({
  targetType: 'payment-request' as const,
  targetId: row._id,
  workspaceId: row.workspaceId,
});
async function statusFor(db: Db, row: PaymentRequest, options: Options) {
  const hash = row.transactionHash ?? row.linkingHash;
  if (hash) {
    const evidence = await options.verify(hash, row, options.now());
    const owned = await ownsSettlement(db, keyFor(hash), targetFor(row));
    return {
      status:
        evidence.status === 'paid'
          ? owned && row.transactionHash
            ? 'paid'
            : 'verification_pending'
          : evidence.status === 'invalid'
            ? 'invalid_payment'
            : evidence.status,
      receipt: evidence.verified
        ? {
            transactionHash: hash,
            payer: evidence.payer,
            blockNumber: evidence.blockNumber,
            blockHash: evidence.blockHash,
            timestamp: evidence.timestamp,
            confirmations: evidence.confirmations,
          }
        : null,
    };
  }
  return {
    status: row.cancelledAt
      ? 'cancelled'
      : Date.parse(row.expiresAt) <= options.now().getTime()
        ? 'expired'
        : 'open',
    receipt: null,
  };
}

export function createPublicPaymentRoutes(options: Options) {
  const app = new Hono<{ Variables: Variables }>();
  app.use('*', async (c, next) => {
    c.header('Referrer-Policy', 'no-referrer');
    const hint = (c.req.header('x-forwarded-for') ?? 'anonymous')
      .split(',')[0]
      .trim()
      .slice(0, 100);
    const digest = createHash('sha256').update(hint).digest('hex');
    const writing = c.req.method !== 'GET';
    await options.rateLimit(
      c.get('db'),
      `pay-global:${writing}`,
      writing ? 300 : 3000,
      options.now(),
      600000,
    );
    await options.rateLimit(
      c.get('db'),
      `pay-client:${writing}:${digest}`,
      writing ? 10 : 60,
      options.now(),
      600000,
    );
    await next();
  });
  async function lookup(db: Db, token: string) {
    if (!tokenPattern.test(token))
      return fail(404, 'Payment request not found.');
    const row = await db
      .collection<PaymentRequest>('paymentRequests')
      .findOne({ token });
    if (!row) return fail(404, 'Payment request not found.');
    return row;
  }
  app.get('/:token', async (c) => {
    const row = await lookup(c.get('db'), c.req.param('token'));
    const derived = await statusFor(c.get('db'), row, options);
    // Explicit whitelist: no workspace ID, owner, labels, notes or session data.
    return c.json({
      recipient: row.recipient,
      amountBaseUnits: row.amountBaseUnits,
      publicBusinessName: row.publicBusinessName,
      publicMemo: row.publicMemo,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      transactionHash: row.transactionHash ?? row.linkingHash ?? null,
      ...derived,
      checkedAt: options.now().toISOString(),
      chainId: paymentDeployment.chainId,
      tokenAddress: paymentDeployment.token,
    });
  });
  app.post('/:token/payment', async (c) => {
    const db = c.get('db'),
      row = await lookup(db, c.req.param('token'));
    const body = await json(c.req.raw);
    if (
      typeof body.transactionHash !== 'string' ||
      !/^0x[0-9a-fA-F]{64}$/.test(body.transactionHash)
    )
      return fail(400, 'Enter a valid transaction hash.');
    const hash = body.transactionHash.toLowerCase() as Hash;
    if (row.cancelledAt)
      return fail(
        409,
        'This payment request is cancelled. Do not send another payment.',
      );
    if (
      (row.transactionHash ?? row.linkingHash) &&
      (row.transactionHash ?? row.linkingHash) !== hash
    )
      return fail(
        409,
        'This request already has a payment transaction. Do not send another payment.',
      );
    const evidence = await options.verify(hash, row, options.now());
    if (evidence.status === 'unavailable')
      return fail(
        503,
        'Verification is temporarily unavailable. Retry this hash; do not send another payment.',
      );
    if (evidence.status === 'invalid')
      return fail(
        409,
        'The transfer must match the MUSD token, recipient and exact amount, and be mined between request creation and expiry. Do not send another payment.',
      );
    // Never let an unmined/unverified hash permanently reserve a public request.
    if (!evidence.verified) {
      if (
        !row.transactionHash &&
        Date.parse(row.expiresAt) <= options.now().getTime()
      )
        return fail(
          409,
          'This request expired. Only a transfer mined before expiry can be linked. Do not send another payment.',
        );
      return c.json(
        {
          status: 'awaiting_confirmation',
          transactionHash: hash,
          note: 'Keep this hash. No settlement reservation is made until a canonical matching transfer event is observed.',
        },
        202,
      );
    }
    const collection = db.collection<PaymentRequest>('paymentRequests');
    // This single-document lock makes cancellation and competing hashes exclusive.
    const locked = await collection.findOneAndUpdate(
      {
        _id: row._id,
        cancelledAt: { $exists: false },
        $and: [
          { $or: [{ linkingHash: { $exists: false } }, { linkingHash: hash }] },
          {
            $or: [
              { transactionHash: { $exists: false } },
              { transactionHash: hash },
            ],
          },
        ],
      },
      { $set: { linkingHash: hash } },
      { returnDocument: 'after' },
    );
    if (!locked)
      return fail(
        409,
        'This request changed while checking payment. Refresh it; do not send another payment.',
      );
    try {
      await reserveSettlement(db, keyFor(hash), targetFor(row), options.now());
    } catch (error) {
      // A known uniqueness conflict is safe to unlock. An unknown database failure
      // retains the lock so the same-target retry can finish after a crash.
      if (error instanceof HTTPException && error.status === 409)
        await collection.updateOne(
          {
            _id: row._id,
            linkingHash: hash,
            transactionHash: { $exists: false },
          },
          { $unset: { linkingHash: '' } },
        );
      throw error;
    }
    await collection.updateOne(
      { _id: row._id, linkingHash: hash },
      {
        $set: { transactionHash: hash, paymentKey: keyFor(hash) },
        $unset: { linkingHash: '' },
      },
    );
    return c.json({
      status: evidence.status,
      transactionHash: hash,
      chainId: paymentDeployment.chainId,
    });
  });
  return app;
}

export function createOwnerPaymentRoutes(options: Options) {
  const app = new Hono<{ Variables: Variables }>();
  app.post('/', async (c) => {
    const body = await json(c.req.raw),
      now = options.now();
    const recipient = text(body.recipient, 'Payee wallet', 42);
    if (
      !isAddress(recipient) ||
      recipient.toLowerCase() === zeroAddress ||
      recipient.toLowerCase() === paymentDeployment.address ||
      recipient.toLowerCase() === paymentDeployment.token
    )
      return fail(400, 'Enter a valid payee wallet address.');
    if (
      typeof body.amount !== 'string' ||
      !/^\d{1,60}(\.\d{1,18})?$/.test(body.amount)
    )
      return fail(
        400,
        'Enter a positive MUSD amount with at most 18 decimal places.',
      );
    const units = parseUnits(body.amount, 18);
    if (units <= 0n || units > (1n << 256n) - 1n)
      return fail(400, 'MUSD amount is outside the supported range.');
    const expires = Date.parse(text(body.expiresAt, 'Expiry', 40));
    if (
      !Number.isFinite(expires) ||
      expires <= now.getTime() ||
      expires > now.getTime() + 90 * 86400000
    )
      return fail(400, 'Choose an expiry within the next 90 days.');
    const row: PaymentRequest = {
      _id: randomUUID(),
      workspaceId: c.req.param('workspaceId')!,
      token: randomBytes(32).toString('base64url'),
      recipient: recipient.toLowerCase(),
      amountBaseUnits: units.toString(),
      publicBusinessName: text(
        body.publicBusinessName,
        'Public business name',
        80,
      ),
      publicMemo: text(body.publicMemo, 'Public memo', 280, true),
      privateNote: text(body.privateNote, 'Private note', 500, true),
      clientLabel: text(body.clientLabel, 'Client label', 80, true),
      createdAt: now.toISOString(),
      expiresAt: new Date(expires).toISOString(),
    };
    await c
      .get('db')
      .collection<PaymentRequest>('paymentRequests')
      .insertOne(row);
    return c.json({ ...row, status: 'open' }, 201);
  });
  app.get('/', async (c) => {
    const after = c.req.query('after');
    if (after && !idPattern.test(after))
      return fail(400, 'Invalid record identifier.');
    const rows = await c
      .get('db')
      .collection<PaymentRequest>('paymentRequests')
      .find({
        workspaceId: c.req.param('workspaceId'),
        ...(after ? { _id: { $gt: after } } : {}),
      })
      .sort({ _id: 1 })
      .limit(26)
      .toArray();
    const items = await Promise.all(
      rows.slice(0, 25).map(async (row) => ({
        ...row,
        ...(await statusFor(c.get('db'), row, options)),
      })),
    );
    return c.json({
      items,
      nextCursor: rows.length > 25 ? rows[24]._id : null,
    });
  });
  app.post('/:requestId/cancel', async (c) => {
    const id = c.req.param('requestId');
    if (!idPattern.test(id)) return fail(400, 'Invalid record identifier.');
    const row = await c
      .get('db')
      .collection<PaymentRequest>('paymentRequests')
      .findOneAndUpdate(
        {
          _id: id,
          workspaceId: c.req.param('workspaceId'),
          transactionHash: { $exists: false },
          linkingHash: { $exists: false },
        },
        { $set: { cancelledAt: options.now().toISOString() } },
        { returnDocument: 'after' },
      );
    if (!row)
      return fail(
        409,
        'Request not found or already has a submitted payment. Refresh before continuing.',
      );
    return c.json({ ok: true, status: 'cancelled' });
  });
  return app;
}
