import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { type Db, type Filter, MongoServerError } from 'mongodb';
import {
  getAddress,
  isAddress,
  parseUnits,
  verifyMessage,
  zeroAddress,
} from 'viem';
import { createSiweMessage } from 'viem/siwe';
import { database } from './db.ts';
import { createAdminRoutes, parseAdminWallets } from './admin.ts';
import { recordWorkspaceActivity } from './admin-metrics.ts';
import { recordAssistantMetric, recordServiceStart } from './admin-insights.ts';
import { recordRequestMetric, requestFamily } from './operations.ts';
import { reserveSettlement } from './settlements.ts';
import {
  contractSignatureVerifier,
  type ContractSignatureVerifier,
  type ContractLoginProof,
} from './contract-auth.ts';
import {
  createParticipationRoutes,
  createTeamOperations,
} from './team-operations.ts';
import {
  workspaceAccess,
  requireRole,
  invoiceApproval,
  requireInvoiceApproval,
  type Member,
  type WorkspaceAccess,
} from './workspace-access.ts';
import {
  createOwnerPaymentRoutes,
  createPublicPaymentRoutes,
} from './payment-requests.ts';
import {
  directPaymentVerifier,
  paymentRequestVerifier,
  type DirectVerifier,
  type TransferVerifier,
} from './direct-payments.ts';
import type { Hash } from 'viem';
import {
  answerQuestion,
  createGeminiModel,
  questionSchema,
  type AssistantModel,
} from './assistant.ts';
import {
  indexBatch,
  rpcIndexSource,
  indexKey,
  paymentDeployment,
  reconcileInvoices,
  reconciliationState,
  type IndexedSchedule,
} from './reconciliation.ts';

type RecordBase = { _id: string };
type Challenge = RecordBase & {
  address: string;
  message: string;
  expiresAt: Date;
  kind?: 'contract';
};
type Session = RecordBase & {
  address: string;
  expiresAt: Date;
  contractProof?: ContractLoginProof;
};
type Workspace = RecordBase & {
  owner: string;
  name: string;
  createdAt: string;
};
type Contractor = RecordBase & {
  workspaceId: string;
  name: string;
  address: string;
  createdAt: string;
};
type Invoice = RecordBase & {
  workspaceId: string;
  contractorId: string;
  recipient: string;
  description: string;
  amount: string;
  amountBaseUnits: string;
  dueDate: string;
  status: 'draft';
  paymentReference?: string;
  paymentKey?: string;
  paymentType?: 'schedule' | 'one-time';
  transactionHash?: Hash;
  scheduleId?: string;
  createdAt: string;
  submittedBy?: string;
  reviewRejected?: string;
};
type RateLimit = RecordBase & { count: number; expiresAt: Date };
type Variables = { db: Db; address: string; workspaceAccess: WorkspaceAccess };
const COOKIE = 'runway_session';
const SESSION_SECONDS = 60 * 60 * 24;
const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const fail = (
  status: 400 | 401 | 403 | 404 | 409 | 429 | 503,
  message: string,
): never => {
  throw new HTTPException(status, { message });
};
function text(value: unknown, field: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    return fail(400, `${field} must contain 1–${max} characters.`);
  return value.trim();
}
function walletAddress(value: unknown) {
  if (
    typeof value !== 'string' ||
    !isAddress(value) ||
    value.toLowerCase() === zeroAddress
  )
    return fail(400, 'Enter a valid nonzero wallet address.');
  return getAddress(value).toLowerCase();
}
function id(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  )
    return fail(400, 'Invalid record identifier.');
  return value;
}
export function invoiceAmount(value: unknown) {
  if (typeof value !== 'string' || !/^\d{1,60}(\.\d{1,18})?$/.test(value))
    return fail(
      400,
      'Use a positive MUSD amount with at most 18 decimal places.',
    );
  const units = parseUnits(value, 18);
  if (units <= 0n || units > (1n << 256n) - 1n)
    return fail(400, 'MUSD amount is outside the supported range.');
  return units.toString();
}
async function json(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return fail(400, 'Send application/json.');
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    return fail(400, 'Invalid JSON body.');
  }
}
async function page<T extends RecordBase>(
  db: Db,
  collection: string,
  filter: Filter<T>,
  cursor?: string,
) {
  const rows = await db
    .collection<T>(collection)
    .find({
      ...filter,
      ...(cursor ? { _id: { $gt: id(cursor) } } : {}),
    } as Filter<T>)
    .sort({ _id: 1 })
    .limit(26)
    .toArray();
  return {
    items: rows.slice(0, 25),
    nextCursor: rows.length > 25 ? rows[24]._id : null,
  };
}
async function rateLimit(
  db: Db,
  key: string,
  max: number,
  now: Date,
  windowMs = 60000,
  message = 'Too many requests. Try again in a minute.',
) {
  const bucket = Math.floor(now.getTime() / windowMs);
  let row;
  try {
    row = await db.collection<RateLimit>('rateLimits').findOneAndUpdate(
      { _id: `${key}:${bucket}` },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(now.getTime() + windowMs * 2) },
      },
      { upsert: true, returnDocument: 'after' },
    );
  } catch (error) {
    // Concurrent first requests may race to insert the same bucket.
    if (!(error instanceof MongoServerError) || error.code !== 11000)
      throw error;
    row = await db
      .collection<RateLimit>('rateLimits')
      .findOneAndUpdate(
        { _id: `${key}:${bucket}` },
        { $inc: { count: 1 } },
        { returnDocument: 'after' },
      );
  }
  if (!row || row.count > max) fail(429, message);
}

export function createApp(
  options: {
    getDb?: () => Promise<Db>;
    origin?: string;
    now?: () => Date;
    assistantModel?: AssistantModel;
    assistantEnabled?: boolean;
    assistantDailyLimit?: number;
    verifyDirectPayment?: DirectVerifier;
    verifyPaymentRequest?: TransferVerifier;
    adminWallets?: string[];
    verifyContractSignature?: ContractSignatureVerifier;
    runIndexer?: ((db: Db) => Promise<boolean>) | null;
  } = {},
) {
  const app = new Hono<{ Variables: Variables }>();
  const getDb = options.getDb ?? database;
  const now = options.now ?? (() => new Date());
  const verifyContractSignature =
    options.verifyContractSignature ?? contractSignatureVerifier();
  const verifyDirectPayment =
    options.verifyDirectPayment ?? directPaymentVerifier();
  const paymentOptions = {
    now,
    rateLimit,
    verify: options.verifyPaymentRequest ?? paymentRequestVerifier(),
  };
  let activeAssistantRequests = 0;
  const configuredOrigin =
    options.origin ??
    process.env.APP_ORIGIN ??
    (process.env.VERCEL || process.env.NODE_ENV === 'production'
      ? ''
      : 'http://127.0.0.1:5173');
  const origin = configuredOrigin ? new URL(configuredOrigin).origin : '';
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'Strict' as const,
    secure: origin.startsWith('https:'),
    path: '/api',
    maxAge: SESSION_SECONDS,
  };

  app.use('*', secureHeaders());
  app.use('*', async (c, next) => {
    const started = performance.now();
    c.header('X-Request-Id', randomUUID());
    await next();
    const family = requestFamily(c.req.path);
    const db = c.get('db');
    if (family && c.res.status >= 500)
      console.warn(
        JSON.stringify({
          event: 'request_failed',
          family,
          status: c.res.status,
          durationMs: Math.round(performance.now() - started),
          requestId: c.res.headers.get('X-Request-Id'),
        }),
      );
    if (family && db) {
      try {
        await recordRequestMetric(
          db,
          family,
          c.res.status,
          performance.now() - started,
          now(),
        );
      } catch {
        console.warn('Request metrics could not be recorded.');
      }
    }
  });
  app.use(
    '*',
    bodyLimit({
      maxSize: 16384,
      onError: (c) => c.json({ error: 'Request too large.' }, 413),
    }),
  );
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      if (!origin) fail(503, 'Backend origin is not configured.');
      if (c.req.header('origin') !== origin)
        fail(403, 'Request origin is not allowed.');
    }
    await next();
  });
  app.get('/api/health', async (c) => {
    try {
      await (await getDb()).command({ ping: 1 });
      return c.json({ status: 'ready', database: 'connected' });
    } catch {
      return c.json(
        {
          status: 'unavailable',
          error: 'MongoDB is not configured or reachable.',
        },
        503,
      );
    }
  });
  let startRecorded = false;
  app.use('/api/*', async (c, next) => {
    try {
      c.set('db', await getDb());
    } catch {
      return c.json({ error: 'MongoDB is not configured or reachable.' }, 503);
    }
    if (!startRecorded) {
      // The first request after boot marks a (cold) start for the admin view.
      startRecorded = true;
      try {
        await recordServiceStart(c.get('db'), now());
      } catch {
        console.warn('Service start could not be recorded.');
      }
    }
    await next();
  });
  app.post('/api/assistant/chat', async (c) => {
    const enabled =
      options.assistantEnabled ?? process.env.ASSISTANT_ENABLED !== 'false';
    if (!enabled || (!options.assistantModel && !process.env.GEMINI_API_KEY))
      return c.json(
        {
          error:
            'The assistant is not available right now. Please use the guide or try again later.',
        },
        503,
      );
    const input = questionSchema.safeParse(await json(c.req.raw));
    if (!input.success)
      return c.json(
        {
          error:
            'Send a question of up to 1,200 characters and at most six previous questions.',
        },
        400,
      );
    const db = c.get('db');
    const instant = now();
    // Client IP headers are an abuse hint, never an authorization boundary.
    // The durable global limits apply even if a caller rotates/spoofs a client hint.
    const clientHint = (c.req.header('x-forwarded-for') || 'anonymous')
      .split(',')[0]
      .trim()
      .slice(0, 100);
    await rateLimit(db, `assistant-client:${digest(clientHint)}`, 6, instant);
    await rateLimit(db, 'assistant-global', 30, instant);
    const daily =
      options.assistantDailyLimit ??
      Number(process.env.ASSISTANT_DAILY_REQUEST_LIMIT || 200);
    if (!Number.isInteger(daily) || daily < 1 || daily > 10000)
      return c.json(
        { error: 'The assistant is temporarily unavailable.' },
        503,
      );
    if (activeAssistantRequests >= 2)
      return c.json(
        { error: 'The assistant is busy. Try again shortly.' },
        429,
      );
    activeAssistantRequests++;
    const requestId = randomUUID();
    const started = Date.now();
    c.header('X-Request-Id', requestId);
    try {
      await rateLimit(
        db,
        'assistant-day',
        daily,
        instant,
        86400000,
        'The assistant has reached its daily usage limit. Please use the guide and try again tomorrow.',
      );
      const signal = AbortSignal.any([
        c.req.raw.signal,
        AbortSignal.timeout(45000),
      ]);
      const reply = await answerQuestion(
        input.data,
        options.assistantModel ?? createGeminiModel(),
        signal,
      );
      try {
        await recordAssistantMetric(
          db,
          { kind: reply.kind, sources: reply.sources.map((s) => s.id) },
          Date.now() - started,
          instant,
        );
      } catch {
        console.warn('Assistant metrics could not be recorded.');
      }
      console.info(
        JSON.stringify({
          event: 'assistant',
          requestId,
          kind: reply.kind,
          sources: reply.sources.map((source) => source.id),
          durationMs: Date.now() - started,
        }),
      );
      return c.json(reply);
    } catch (failure) {
      if (failure instanceof HTTPException) throw failure;
      await recordAssistantMetric(
        db,
        { failed: true },
        Date.now() - started,
        instant,
      ).catch(() => {});
      console.warn(
        JSON.stringify({
          event: 'assistant_failed',
          requestId,
          durationMs: Date.now() - started,
        }),
      );
      return c.json(
        {
          error:
            'I couldn’t complete that answer. Please try again or open the guide.',
        },
        503,
      );
    } finally {
      activeAssistantRequests--;
    }
  });
  app.post('/api/auth/challenge', async (c) => {
    const input = await json(c.req.raw);
    const address = walletAddress(input.address);
    if (input.kind !== undefined && input.kind !== 'contract')
      return fail(400, 'Choose a valid wallet login kind.');
    const db = c.get('db');
    const issuedAt = now();
    await rateLimit(db, 'auth-global', 300, issuedAt);
    await rateLimit(db, `challenge:${address}`, 10, issuedAt);
    const nonce = randomBytes(16).toString('hex');
    const expiresAt = new Date(issuedAt.getTime() + 300000);
    const message = createSiweMessage({
      address: getAddress(address),
      chainId: 31611,
      domain: new URL(origin).host,
      uri: origin,
      version: '1',
      nonce,
      issuedAt,
      expirationTime: expiresAt,
      statement:
        'Sign in to Runway. This does not authorize any payment or blockchain transaction.',
    });
    await db.collection<Challenge>('challenges').insertOne({
      _id: nonce,
      address,
      message,
      expiresAt,
      ...(input.kind === 'contract' ? { kind: 'contract' as const } : {}),
    });
    return c.json({ nonce, message, expiresAt: expiresAt.toISOString() });
  });
  app.post('/api/auth/verify', async (c) => {
    const body = await json(c.req.raw);
    const nonce = text(body.nonce, 'Nonce', 32);
    const signature = text(body.signature, 'Signature', 8194);
    if (
      !/^[a-f0-9]{32}$/.test(nonce) ||
      !/^0x(?:[a-fA-F0-9]{2}){1,4096}$/.test(signature)
    )
      return fail(400, 'Invalid nonce or wallet signature.');
    const db = c.get('db');
    await rateLimit(db, 'auth-global', 300, now());
    const challenge = await db
      .collection<Challenge>('challenges')
      .findOne({ _id: nonce, expiresAt: { $gt: now() } });
    if (!challenge)
      return fail(401, 'Login request expired or already used. Sign again.');
    await rateLimit(db, `verify:${challenge.address}`, 20, now());
    let valid = false;
    const proof: ContractLoginProof = {
      address: getAddress(challenge.address),
      message: challenge.message,
      signature: signature as `0x${string}`,
    };
    try {
      valid =
        challenge.kind === 'contract'
          ? await verifyContractSignature(proof)
          : signature.length === 132 && (await verifyMessage(proof));
    } catch {
      if (challenge.kind === 'contract')
        return fail(
          503,
          'Contract-wallet verification unavailable. The challenge was not consumed; retry when Mezo RPC is current.',
        );
      /* Malformed signatures are authentication failures. */
    }
    if (!valid)
      return fail(401, 'Signature does not match the requested wallet.');
    // Consumption is atomic, including under concurrent verification requests.
    const consumed = await db
      .collection<Challenge>('challenges')
      .findOneAndDelete({ _id: nonce, expiresAt: { $gt: now() } });
    if (!consumed)
      return fail(401, 'Login request expired or already used. Sign again.');
    const oldToken = getCookie(c, COOKIE);
    if (oldToken)
      await db
        .collection<Session>('sessions')
        .deleteOne({ _id: digest(oldToken) });
    const token = randomBytes(32).toString('hex');
    await db.collection<Session>('sessions').insertOne({
      _id: digest(token),
      address: challenge.address,
      expiresAt: new Date(now().getTime() + SESSION_SECONDS * 1000),
      ...(challenge.kind === 'contract' ? { contractProof: proof } : {}),
    });
    setCookie(c, COOKIE, token, cookieOptions);
    return c.json({ address: challenge.address });
  });
  app.route('/api/pay', createPublicPaymentRoutes(paymentOptions));
  app.use('/api/*', async (c, next) => {
    const token = getCookie(c, COOKIE);
    const session =
      token && /^[a-f0-9]{64}$/.test(token)
        ? await c
            .get('db')
            .collection<Session>('sessions')
            .findOne({ _id: digest(token), expiresAt: { $gt: now() } })
        : null;
    if (!session)
      return c.json({ error: 'Sign in with your wallet to continue.' }, 401);
    if (session.contractProof) {
      let valid: boolean;
      try {
        valid = await verifyContractSignature(session.contractProof);
      } catch {
        return fail(
          503,
          'Contract-wallet session verification is unavailable. No workspace action was authorized.',
        );
      }
      if (!valid) {
        await c
          .get('db')
          .collection<Session>('sessions')
          .deleteOne({ _id: session._id });
        return fail(
          401,
          'Contract-wallet signature is no longer valid. Sign in again.',
        );
      }
    }
    c.set('address', session.address);
    if (c.req.method !== 'GET')
      await rateLimit(c.get('db'), `write:${session.address}`, 60, now());
    await next();
  });
  app.get('/api/auth/session', (c) => c.json({ address: c.get('address') }));
  app.route(
    '/api/admin',
    createAdminRoutes({
      now,
      wallets: () =>
        parseAdminWallets(
          options.adminWallets?.join(',') ?? process.env.RUNWAY_ADMIN_WALLETS,
        ),
      throttle: (db, address, instant) =>
        rateLimit(db, `admin:${address}`, 30, instant),
      actionThrottle: (db, instant) =>
        rateLimit(
          db,
          'admin-reindex',
          3,
          instant,
          60000,
          'Re-indexing was requested recently. Wait a minute.',
        ),
      runIndexer:
        options.runIndexer === null
          ? undefined
          : (options.runIndexer ??
            (process.env.PAYMENT_INDEXER_ENABLED === 'true'
              ? (db) => indexBatch(db, rpcIndexSource())
              : undefined)),
    }),
  );
  app.use('/api/workspaces*', async (c, next) => {
    await next();
    if (c.res.status < 400) {
      try {
        await recordWorkspaceActivity(c.get('db'), c.get('address'), now());
      } catch {
        console.warn('Workspace activity could not be recorded.');
      }
    }
  });
  app.post('/api/auth/logout', async (c) => {
    await c
      .get('db')
      .collection<Session>('sessions')
      .deleteOne({ _id: digest(getCookie(c, COOKIE)!) });
    setCookie(c, COOKIE, '', { ...cookieOptions, maxAge: 0 });
    return c.json({ ok: true });
  });
  app.route('/api/participation', createParticipationRoutes(now));
  app.get('/api/workspaces', async (c) => {
    const memberships = await c
      .get('db')
      .collection<Member>('workspaceMembers')
      .find({
        address: c.get('address'),
        status: 'active',
        role: { $ne: 'contractor' },
      })
      .limit(1001)
      .toArray();
    const result = await page<Workspace>(
      c.get('db'),
      'workspaces',
      {
        $or: [
          { owner: c.get('address') },
          {
            _id: { $in: memberships.slice(0, 1000).map((m) => m.workspaceId) },
          },
        ],
      },
      c.req.query('after'),
    );
    return c.json({
      ...result,
      partial: memberships.length > 1000,
      items: result.items.map((w) => ({
        ...w,
        role:
          w.owner === c.get('address')
            ? 'owner'
            : memberships.find((m) => m.workspaceId === w._id)!.role,
      })),
    });
  });
  app.post('/api/workspaces', async (c) => {
    const name = text((await json(c.req.raw)).name, 'Workspace name', 80);
    const row: Workspace = {
      _id: randomUUID(),
      owner: c.get('address'),
      name,
      createdAt: now().toISOString(),
    };
    await c.get('db').collection<Workspace>('workspaces').insertOne(row);
    return c.json(row, 201);
  });
  app.use('/api/workspaces/:workspaceId/*', async (c, next) => {
    const access = await workspaceAccess(
      c.get('db'),
      id(c.req.param('workspaceId')),
      c.get('address'),
    );
    c.set('workspaceAccess', access);
    if (c.req.method !== 'GET') {
      const path = c.req.path;
      if (
        /\/(?:contractors|invoices|payment-requests)$/.test(path) ||
        /\/payment-requests\/[^/]+\/cancel$/.test(path)
      )
        requireRole(access, ['owner', 'manager']);
      if (/\/invoices\/[^/]+\/payment$/.test(path))
        requireRole(access, ['owner']);
      const event = randomUUID();
      const audit = c.get('db').collection<{
        _id: string;
        workspaceId: string;
        actor: string;
        action: string;
        outcome: string;
        createdAt: string;
        expiresAt: Date;
      }>('workspaceAudit');
      await audit.insertOne({
        _id: event,
        workspaceId: access.workspace._id,
        actor: c.get('address'),
        action: path
          .slice(`/api/workspaces/${access.workspace._id}/`.length)
          .slice(0, 240),
        outcome: 'started',
        createdAt: now().toISOString(),
        expiresAt: new Date(now().getTime() + 365 * 86400000),
      });
      try {
        await next();
      } finally {
        await audit.updateOne(
          { _id: event },
          { $set: { outcome: c.res.status < 400 ? 'completed' : 'rejected' } },
        );
      }
    } else await next();
  });
  app.route(
    '/api/workspaces/:workspaceId',
    createTeamOperations({ now, verify: verifyDirectPayment }),
  );
  app.get('/api/workspaces/:workspaceId/contractors', async (c) =>
    c.json(
      await page<Contractor>(
        c.get('db'),
        'contractors',
        { workspaceId: c.req.param('workspaceId') },
        c.req.query('after'),
      ),
    ),
  );
  app.route(
    '/api/workspaces/:workspaceId/payment-requests',
    createOwnerPaymentRoutes(paymentOptions),
  );
  app.post('/api/workspaces/:workspaceId/contractors', async (c) => {
    const body = await json(c.req.raw);
    const row: Contractor = {
      _id: randomUUID(),
      workspaceId: c.req.param('workspaceId'),
      name: text(body.name, 'Contractor name', 80),
      address: walletAddress(body.address),
      createdAt: now().toISOString(),
    };
    await c.get('db').collection<Contractor>('contractors').insertOne(row);
    return c.json(row, 201);
  });
  app.get('/api/workspaces/:workspaceId/invoices', async (c) => {
    const rows = await page<Invoice>(
      c.get('db'),
      'invoices',
      { workspaceId: c.req.param('workspaceId') },
      c.req.query('after'),
    );
    const result = await reconcileInvoices(
      c.get('db'),
      rows.items,
      c.get('workspaceAccess').workspace.owner,
      now(),
      verifyDirectPayment,
    );
    return c.json({
      ...rows,
      ...result,
      items: await Promise.all(
        result.items.map(async (invoice, index) => ({
          ...rows.items[index],
          payment: invoice.payment,
          approval: await invoiceApproval(
            c.get('db'),
            c.get('workspaceAccess'),
            rows.items[index],
          ),
        })),
      ),
    });
  });
  app.post(
    '/api/workspaces/:workspaceId/invoices/:invoiceId/payment',
    async (c) => {
      const db = c.get('db');
      const invoice = await db.collection<Invoice>('invoices').findOne({
        _id: id(c.req.param('invoiceId')),
        workspaceId: c.req.param('workspaceId'),
      });
      if (!invoice) return fail(404, 'Invoice not found.');
      await requireInvoiceApproval(db, c.get('workspaceAccess'), invoice);
      const body = await json(c.req.raw);
      if (invoice.paymentType === 'one-time') {
        if (
          typeof body.transactionHash !== 'string' ||
          !/^0x[a-fA-F0-9]{64}$/.test(body.transactionHash)
        )
          return fail(400, 'Enter a valid transaction hash.');
        const transactionHash = body.transactionHash.toLowerCase() as Hash;
        if (
          invoice.transactionHash &&
          invoice.transactionHash !== transactionHash
        )
          return fail(409, 'This invoice already has a linked transaction.');
        const status = await verifyDirectPayment(
          transactionHash,
          invoice,
          c.get('address'),
          now(),
        );
        if (status === 'invalid')
          return fail(
            409,
            'Transfer must match this invoice’s sender, recipient and exact MUSD amount, and occur after invoice creation.',
          );
        if (status === 'unavailable')
          return fail(
            503,
            'Could not verify the payment. Retry linking this transaction; do not send another payment.',
          );
        await reserveSettlement(
          db,
          `${paymentDeployment.chainId}:${paymentDeployment.token}:${transactionHash}`,
          {
            targetType: 'invoice',
            targetId: invoice._id,
            workspaceId: invoice.workspaceId,
          },
          now(),
        );
        try {
          const result = await db.collection<Invoice>('invoices').updateOne(
            {
              _id: invoice._id,
              $or: [
                { transactionHash: { $exists: false } },
                { transactionHash },
              ],
            },
            {
              $set: {
                transactionHash,
                paymentKey: `${paymentDeployment.chainId}:${paymentDeployment.token}:${transactionHash}`,
              },
            },
          );
          if (!result.matchedCount)
            return fail(409, 'This invoice already has a linked transaction.');
        } catch (error) {
          if (error instanceof MongoServerError && error.code === 11000)
            return fail(
              409,
              'This transfer is already linked to another invoice.',
            );
          throw error;
        }
        return c.json({ ok: true, status, chainId: paymentDeployment.chainId });
      }
      if (
        typeof body.scheduleId !== 'string' ||
        !/^[1-9]\d{0,77}$/.test(body.scheduleId) ||
        BigInt(body.scheduleId) > (1n << 256n) - 1n
      )
        return fail(400, 'Enter a valid schedule ID.');
      if (invoice.scheduleId && invoice.scheduleId !== body.scheduleId)
        return fail(409, 'This invoice already has a linked schedule.');
      const { state, available } = await reconciliationState(db, now());
      if (!available)
        return fail(
          503,
          'Payment indexing is not current. Retry after synchronization.',
        );
      const schedule = await db
        .collection<IndexedSchedule>('paymentSchedules')
        .findOne({
          generation: state!.generation,
          scheduleId: body.scheduleId,
        });
      if (!schedule)
        return fail(409, 'Schedule has not been confirmed by the indexer.');
      if (
        schedule.sender !== c.get('address') ||
        schedule.recipient !== invoice.recipient ||
        schedule.total !== invoice.amountBaseUnits
      )
        return fail(
          409,
          'Schedule sender, recipient and total must match this invoice exactly.',
        );
      if (
        schedule.referenceHash !== `0x${'0'.repeat(64)}` &&
        schedule.referenceHash !== invoice.paymentReference
      )
        return fail(409, 'Schedule references another payment.');
      await reserveSettlement(
        db,
        `${indexKey}:${body.scheduleId}`,
        {
          targetType: 'invoice',
          targetId: invoice._id,
          workspaceId: invoice.workspaceId,
        },
        now(),
      );
      try {
        const result = await db.collection<Invoice>('invoices').updateOne(
          {
            _id: invoice._id,
            $or: [
              { scheduleId: { $exists: false } },
              { scheduleId: body.scheduleId },
            ],
          },
          {
            $set: {
              scheduleId: body.scheduleId,
              paymentKey: `${indexKey}:${body.scheduleId}`,
            },
          },
        );
        if (!result.matchedCount)
          return fail(409, 'This invoice already has a linked schedule.');
      } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000)
          return fail(409, 'Schedule is already linked to another invoice.');
        throw error;
      }
      return c.json({ ok: true, chainId: paymentDeployment.chainId });
    },
  );
  app.post('/api/workspaces/:workspaceId/invoices', async (c) => {
    const body = await json(c.req.raw);
    const contractorId = id(body.contractorId);
    const contractor = await c
      .get('db')
      .collection<Contractor>('contractors')
      .findOne({ _id: contractorId, workspaceId: c.req.param('workspaceId') });
    if (!contractor)
      return fail(404, 'Contractor not found in this workspace.');
    const amountBaseUnits = invoiceAmount(body.amount);
    const paymentType = body.paymentType ?? 'schedule';
    if (paymentType !== 'schedule' && paymentType !== 'one-time')
      return fail(400, 'Choose a valid invoice payment type.');
    const dueDate = text(body.dueDate, 'Due date', 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
      !Number.isFinite(Date.parse(dueDate)) ||
      new Date(dueDate).toISOString().slice(0, 10) !== dueDate
    )
      return fail(400, 'Enter a valid due date (YYYY-MM-DD).');
    const row: Invoice = {
      _id: randomUUID(),
      workspaceId: c.req.param('workspaceId'),
      contractorId,
      recipient: contractor.address,
      description: text(body.description, 'Description', 500),
      amount: body.amount as string,
      amountBaseUnits,
      paymentType,
      dueDate,
      status: 'draft',
      paymentReference: `0x${randomBytes(32).toString('hex')}`,
      createdAt: now().toISOString(),
    };
    await c.get('db').collection<Invoice>('invoices').insertOne(row);
    return c.json(row, 201);
  });
  app.notFound((c) => c.json({ error: 'API route not found.' }, 404));
  app.onError((error, c) => {
    if (error instanceof HTTPException)
      return c.json({ error: error.message }, error.status);
    if (error instanceof MongoServerError && error.code === 11000)
      return c.json(
        { error: 'This contractor wallet is already saved in the workspace.' },
        409,
      );
    // Never expose MongoDB URIs, driver details, signatures or session tokens.
    return c.json({ error: 'Request failed. Please retry.' }, 500);
  });
  return app;
}

export default createApp();
