import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createApp } from './app.ts';
import { initializeDatabase } from './db.ts';
const origin = 'http://127.0.0.1:5173';
const owner = privateKeyToAccount(generatePrivateKey());
const colleague = privateKeyToAccount(generatePrivateKey());
const contractor = privateKeyToAccount(generatePrivateKey());
const outside = privateKeyToAccount(generatePrivateKey());
let mongo: MongoMemoryServer,
  client: MongoClient,
  db: Db,
  app: ReturnType<typeof createApp>;
let ownerCookie: string,
  colleagueCookie: string,
  contractorCookie: string,
  outsideCookie: string,
  workspaceId: string,
  contractorId: string;
let contractValid = true,
  contractUnavailable = false;
const instant = new Date('2026-11-04T12:00:00Z');
const call = (path: string, data?: unknown, cookie = ownerCookie) =>
  app.request(`/api${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
async function login(account: typeof owner) {
  const challenge = await (
    await call('/auth/challenge', { address: account.address }, '')
  ).json();
  const response = await call(
    '/auth/verify',
    {
      nonce: challenge.nonce,
      signature: await account.signMessage({ message: challenge.message }),
    },
    '',
  );
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0];
}
async function invite(role: string) {
  const response = await call(`/workspaces/${workspaceId}/members`, {
    address: colleague.address,
    role,
  });
  expect(response.status).toBe(201);
  expect(
    (await call(`/participation/${workspaceId}/accept`, {}, colleagueCookie))
      .status,
  ).toBe(200);
  return (await response.json())._id as string;
}
async function invoice(submitted = false) {
  const response = await call(
    submitted
      ? `/participation/${workspaceId}/invoices`
      : `/workspaces/${workspaceId}/invoices`,
    {
      contractorId,
      description: '=dangerous formula',
      amount: '10.000000000000000001',
      dueDate: '2026-11-03',
      paymentType: 'one-time',
    },
    submitted ? contractorCookie : ownerCookie,
  );
  expect(response.status).toBe(201);
  return response.json();
}
const snapshot = async (cookie = ownerCookie) =>
  (
    await call(`/workspaces/${workspaceId}/operations`, undefined, cookie)
  ).json();
beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17' } });
  client = await new MongoClient(mongo.getUri()).connect();
  db = client.db('runway_team_tests');
  await initializeDatabase(db);
}, 120000);
beforeEach(async () => {
  for (const collection of await db.collections())
    await collection.deleteMany({});
  contractValid = true;
  contractUnavailable = false;
  app = createApp({
    origin,
    getDb: async () => db,
    now: () => instant,
    verifyDirectPayment: async () => 'paid',
    verifyContractSignature: async () => {
      if (contractUnavailable) throw new Error('offline');
      return contractValid;
    },
  });
  [ownerCookie, colleagueCookie, contractorCookie, outsideCookie] =
    await Promise.all([
      login(owner),
      login(colleague),
      login(contractor),
      login(outside),
    ]);
  workspaceId = (
    await (await call('/workspaces', { name: 'Private studio' })).json()
  )._id;
  contractorId = (
    await (
      await call(`/workspaces/${workspaceId}/contractors`, {
        name: 'Private contractor',
        address: contractor.address,
      })
    ).json()
  )._id;
});
afterAll(async () => {
  await client?.close();
  await mongo?.stop();
});
describe('team operations authorization and business workflows', () => {
  it('requires an invited contractor to accept and blocks new submissions after revocation', async () => {
    const inviteResponse = await call(`/workspaces/${workspaceId}/members`, {
      address: contractor.address,
      role: 'contractor',
    });
    const member = await inviteResponse.json();
    const path = `/participation/${workspaceId}/invoices`;
    const terms = {
      description: 'Contractor access check',
      amount: '1',
      dueDate: '2026-11-10',
    };
    expect((await call(path, terms, contractorCookie)).status).toBe(404);
    await call(`/participation/${workspaceId}/accept`, {}, contractorCookie);
    expect((await call(path, terms, contractorCookie)).status).toBe(201);
    await call(
      `/workspaces/${workspaceId}/members/${encodeURIComponent(member._id)}/revoke`,
      {},
    );
    expect((await call(path, terms, contractorCookie)).status).toBe(404);
    expect(
      (await (await call('/participation', undefined, contractorCookie)).json())
        .contractorWorkspaces,
    ).toHaveLength(0);
  });
  it('requires wallet-specific acceptance and denies outsiders and revoked members', async () => {
    const path = `/workspaces/${workspaceId}/members`;
    const response = await call(path, {
      address: colleague.address,
      role: 'viewer',
    });
    const member = await response.json();
    expect(
      (
        await call(
          `/workspaces/${workspaceId}/operations`,
          undefined,
          colleagueCookie,
        )
      ).status,
    ).toBe(404);
    expect(
      (await call(`/participation/${workspaceId}/accept`, {}, outsideCookie))
        .status,
    ).toBe(404);
    await call(`/participation/${workspaceId}/accept`, {}, colleagueCookie);
    expect((await call('/workspaces', undefined, colleagueCookie)).status).toBe(
      200,
    );
    expect((await snapshot(colleagueCookie)).workspace.role).toBe('viewer');
    expect(
      (
        await call(
          `/workspaces/${workspaceId}/contractors`,
          { name: 'No', address: outside.address },
          colleagueCookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          `/workspaces/${workspaceId}/members`,
          { address: outside.address, role: 'manager' },
          colleagueCookie,
        )
      ).status,
    ).toBe(403);
    await call(`${path}/${encodeURIComponent(member._id)}/revoke`, {});
    expect(
      (
        await call(
          `/workspaces/${workspaceId}/operations`,
          undefined,
          colleagueCookie,
        )
      ).status,
    ).toBe(404);
    expect(
      (await (await call('/workspaces', undefined, colleagueCookie)).json())
        .items,
    ).toHaveLength(0);
  });
  it('lets managers prepare records but reserves payment linking to the owner', async () => {
    await invite('manager');
    expect(
      (
        await call(
          `/workspaces/${workspaceId}/invoices`,
          {
            contractorId,
            description: 'Prepared',
            amount: '5',
            dueDate: '2026-11-05',
          },
          colleagueCookie,
        )
      ).status,
    ).toBe(201);
    const i = await invoice();
    expect(
      (
        await call(
          `/workspaces/${workspaceId}/invoices/${i._id}/payment`,
          { transactionHash: `0x${'a'.repeat(64)}` },
          colleagueCookie,
        )
      ).status,
    ).toBe(403);
  });
  it('keeps submissions restricted to the signed contractor and other workspace data private', async () => {
    expect(
      (
        await call(
          `/participation/${workspaceId}/invoices`,
          { amount: '5', dueDate: '2026-11-05', description: 'Spoof' },
          outsideCookie,
        )
      ).status,
    ).toBe(404);
    const i = await invoice(true);
    expect(i.recipient).toBe(contractor.address.toLowerCase());
    expect(
      (
        await call(
          `/workspaces/${workspaceId}/invoices`,
          undefined,
          contractorCookie,
        )
      ).status,
    ).toBe(404);
    const own = await (
      await call('/participation', undefined, contractorCookie)
    ).json();
    expect(own.invoices).toHaveLength(1);
    expect(JSON.stringify(own)).not.toContain('Private contractor');
    expect((await snapshot()).invoices[0].approval).toMatchObject({
      ready: false,
      required: 1,
    });
    const paymentPath = `/workspaces/${workspaceId}/invoices/${i._id}/payment`;
    expect(
      (await call(paymentPath, { transactionHash: `0x${'a'.repeat(64)}` }))
        .status,
    ).toBe(409);
    await call(`/workspaces/${workspaceId}/invoices/${i._id}/review`, {
      decision: 'approve',
    });
    expect(
      (await call(paymentPath, { transactionHash: `0x${'a'.repeat(64)}` }))
        .status,
    ).toBe(200);
  });
  it('requires distinct active reviewers and invalidates approvals on policy changes and revocation', async () => {
    const memberId = await invite('approver');
    const i = await invoice(true);
    await call(`/workspaces/${workspaceId}/approval-policy`, {
      requiredApprovals: 2,
    });
    const reviewPath = `/workspaces/${workspaceId}/invoices/${i._id}/review`;
    await Promise.all([
      call(reviewPath, { decision: 'approve' }),
      call(reviewPath, { decision: 'approve' }),
    ]);
    expect((await snapshot()).invoices[0].approval).toMatchObject({
      ready: false,
      approvedBy: [owner.address.toLowerCase()],
    });
    await call(reviewPath, { decision: 'approve' }, colleagueCookie);
    expect((await snapshot()).invoices[0].approval.ready).toBe(true);
    await call(
      `/workspaces/${workspaceId}/members/${encodeURIComponent(memberId)}/revoke`,
      {},
    );
    expect((await snapshot()).invoices[0].approval.ready).toBe(false);
    await invite('approver');
    expect((await snapshot()).invoices[0].approval.approvedBy).toHaveLength(0);
    await call(`/workspaces/${workspaceId}/approval-policy`, {
      requiredApprovals: 1,
    });
    expect((await snapshot()).invoices[0].approval.approvedBy).toHaveLength(0);
  });
  it('blocks self-approval even when a contractor also holds an approver role', async () => {
    await call(`/workspaces/${workspaceId}/members`, {
      address: contractor.address,
      role: 'approver',
    });
    await call(`/participation/${workspaceId}/accept`, {}, contractorCookie);
    const i = await invoice(true);
    expect(
      (
        await call(
          `/workspaces/${workspaceId}/invoices/${i._id}/review`,
          { decision: 'approve' },
          contractorCookie,
        )
      ).status,
    ).toBe(403);
  });
  it('rejects immutable invoice terms and prevents preparation/linking after rejection', async () => {
    const i = await invoice(true);
    await call(`/workspaces/${workspaceId}/invoices/${i._id}/review`, {
      decision: 'reject',
      reason: 'Deliverable incomplete',
    });
    expect((await snapshot()).invoices[0].approval.rejected).toBe(true);
    expect(
      (
        await call(`/workspaces/${workspaceId}/invoices/${i._id}/payment`, {
          transactionHash: `0x${'b'.repeat(64)}`,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call(`/workspaces/${workspaceId}/invoices/${i._id}/review`, {
          decision: 'approve',
        })
      ).status,
    ).toBe(409);
  });
  it('prepares exact payroll totals, requires run approval, and reports confirmed evidence', async () => {
    const first = await invoice();
    const second = await invoice();
    const response = await call(`/workspaces/${workspaceId}/payroll-runs`, {
      name: 'November payroll',
      invoiceIds: [first._id, second._id],
    });
    expect(response.status).toBe(201);
    const run = await response.json();
    expect(run.totalBaseUnits).toBe('20000000000000000002');
    const path = `/workspaces/${workspaceId}/payroll-runs/${run._id}`;
    expect((await call(`${path}/payment-plan`)).status).toBe(409);
    expect(
      (
        await call(
          `/workspaces/${workspaceId}/invoices/${first._id}/payment-plan`,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(`/workspaces/${workspaceId}/payroll-runs`, {
          name: 'Another run',
          invoiceIds: [first._id],
        })
      ).status,
    ).toBe(409);
    await call(`${path}/approve`, {});
    expect((await call(`${path}/payment-plan`)).status).toBe(200);
    expect(
      (await snapshot()).invoices.every(
        (i: { payment: { status: string } }) => i.payment.status === 'draft',
      ),
    ).toBe(true);
    await call(`/workspaces/${workspaceId}/invoices/${first._id}/payment`, {
      transactionHash: `0x${'c'.repeat(64)}`,
    });
    expect((await snapshot()).report.claimedBaseUnits).toBe(
      '10000000000000000001',
    );
    expect(
      (
        await call(`/workspaces/${workspaceId}/payroll-runs`, {
          name: 'Duplicate',
          invoiceIds: [second._id, second._id],
        })
      ).status,
    ).toBe(400);
  });
  it('prepares one recurring occurrence under concurrent retries and preserves month-end cadence', async () => {
    const response = await call(`/workspaces/${workspaceId}/recurring-plans`, {
      contractorId,
      description: 'Monthly retainer',
      amount: '12',
      nextDueDate: '2026-01-31',
      cadence: 'monthly',
      interval: 1,
      paymentType: 'one-time',
    });
    expect(response.status).toBe(201);
    const plan = await response.json();
    const path = `/workspaces/${workspaceId}/recurring-plans/${plan._id}`;
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        call(`${path}/prepare`, { dueDate: '2026-01-31' }),
      ),
    );
    expect(results.every((r) => r.status < 300)).toBe(true);
    expect(
      await db
        .collection('invoices')
        .countDocuments({ recurrenceKey: `${plan._id}:2026-01-31` }),
    ).toBe(1);
    expect((await snapshot()).plans[0].nextDueDate).toBe('2026-02-28');
    await call(`${path}/prepare`, { dueDate: '2026-02-28' });
    expect((await snapshot()).plans[0].nextDueDate).toBe('2026-03-31');
    await call(`${path}/pause`, { paused: true });
    expect(
      (await call(`${path}/prepare`, { dueDate: '2026-03-31' })).status,
    ).toBe(409);
  });
  it('advances a recurring cursor after an interrupted prior occurrence was already inserted', async () => {
    const plan = await (
      await call(`/workspaces/${workspaceId}/recurring-plans`, {
        contractorId,
        description: 'Recover',
        amount: '1',
        nextDueDate: '2026-11-04',
        cadence: 'weekly',
        interval: 1,
      })
    ).json();
    const path = `/workspaces/${workspaceId}/recurring-plans/${plan._id}/prepare`;
    const first = await (await call(path, { dueDate: '2026-11-04' })).json();
    await db
      .collection('recurringPlans')
      .updateOne({ _id: plan._id } as never, {
        $set: { nextDueDate: '2026-11-04' },
      });
    const retry = await (await call(path, { dueDate: '2026-11-04' })).json();
    expect(retry._id).toBe(first._id);
    expect((await snapshot()).plans[0].nextDueDate).toBe('2026-11-11');
  });
  it('keeps reminders opt-in and private per wallet and exports formula-safe verified reports', async () => {
    await invoice();
    await invite('viewer');
    expect((await snapshot()).reminders).toHaveLength(0);
    await call(`/workspaces/${workspaceId}/notification-preferences`, {
      enabled: true,
      dueDays: 7,
    });
    expect((await snapshot()).reminders[0].kind).toBe('overdue');
    expect((await snapshot(colleagueCookie)).reminders).toHaveLength(0);
    const csv = await call(`/workspaces/${workspaceId}/report.csv`);
    expect(csv.status).toBe(200);
    expect(await csv.text()).toContain('"\'=dangerous formula"');
    const audit = (await snapshot()).audit;
    expect(
      audit.some(
        (a: { action: string; outcome: string }) =>
          a.action === 'notification-preferences' && a.outcome === 'completed',
      ),
    ).toBe(true);
    expect(JSON.stringify(audit)).not.toContain(ownerCookie);
  });
  it('checks contract signatures again on requests and denies stale authority without consuming failed challenges', async () => {
    const challenge = await (
      await call(
        '/auth/challenge',
        { address: outside.address, kind: 'contract' },
        '',
      )
    ).json();
    contractUnavailable = true;
    expect(
      (
        await call(
          '/auth/verify',
          { nonce: challenge.nonce, signature: '0xabcd' },
          '',
        )
      ).status,
    ).toBe(503);
    contractUnavailable = false;
    const response = await call(
      '/auth/verify',
      { nonce: challenge.nonce, signature: '0xabcd' },
      '',
    );
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    expect((await call('/auth/session', undefined, cookie)).status).toBe(200);
    contractValid = false;
    expect((await call('/workspaces', undefined, cookie)).status).toBe(401);
    expect(
      (
        await call(
          '/auth/verify',
          { nonce: challenge.nonce, signature: '0xabcd' },
          '',
        )
      ).status,
    ).toBe(401);
  });
});
