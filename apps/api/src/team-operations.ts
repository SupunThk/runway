import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { Hono } from 'hono';
import { MongoServerError, type Db } from 'mongodb';
import { getAddress, isAddress, parseUnits, zeroAddress } from 'viem';
import {
  nextOccurrence,
  validUtcDate,
  csvCell,
  type TeamInvoice,
  type PayrollRun,
  type RecurringPlan,
} from '../../../packages/mezo/src/team-operations.ts';
import { reconcileInvoices } from './reconciliation.ts';
import type { DirectVerifier } from './direct-payments.ts';
import {
  invoiceApproval,
  reviewApproval,
  requireRole,
  teamFail,
  type TeamVariables,
  type TeamWorkspace,
  type Member,
} from './workspace-access.ts';

const roles = ['manager', 'approver', 'viewer', 'contractor'] as const;
function text(value: unknown, name: string, max = 100) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    teamFail(400, `${name} must contain 1–${max} characters.`);
  return value.trim();
}
function address(value: unknown) {
  if (
    typeof value !== 'string' ||
    !isAddress(value) ||
    value.toLowerCase() === zeroAddress
  )
    teamFail(400, 'Enter a valid nonzero wallet address.');
  return getAddress(value).toLowerCase();
}
function date(value: unknown) {
  if (!validUtcDate(value))
    teamFail(400, 'Enter a valid date between 2000 and 2199 (YYYY-MM-DD).');
  return value;
}
function amount(value: unknown) {
  if (typeof value !== 'string' || !/^\d{1,60}(\.\d{1,18})?$/.test(value))
    teamFail(400, 'Enter a positive MUSD amount with at most 18 decimals.');
  const units = parseUnits(value, 18);
  if (units <= 0n || units > (1n << 256n) - 1n)
    teamFail(400, 'MUSD amount is outside the supported range.');
  return { amount: value, amountBaseUnits: units.toString() };
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    teamFail(400, 'Send application/json.');
  try {
    const value = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    return teamFail(400, 'Invalid JSON body.');
  }
}
async function recent<T extends { _id: string }>(
  db: Db,
  collection: string,
  workspaceId: string,
) {
  const rows = await db
    .collection<T>(collection)
    .find({ workspaceId } as never)
    .sort({ createdAt: -1, _id: 1 })
    .limit(101)
    .toArray();
  return { rows: rows.slice(0, 100), partial: rows.length > 100 };
}
async function invoiceTerms(
  db: Db,
  workspaceId: string,
  input: Record<string, unknown>,
  createdAt: string,
): Promise<TeamInvoice> {
  const contractor = await db
    .collection<{ _id: string; workspaceId: string; address: string }>(
      'contractors',
    )
    .findOne({
      _id: text(input.contractorId, 'Contractor ID', 80),
      workspaceId,
    });
  if (!contractor) teamFail(404, 'Contractor not found in this workspace.');
  const paymentType = input.paymentType ?? 'schedule';
  if (paymentType !== 'schedule' && paymentType !== 'one-time')
    teamFail(400, 'Choose a valid payment type.');
  return {
    _id: randomUUID(),
    workspaceId,
    contractorId: contractor._id,
    recipient: contractor.address,
    description: text(input.description, 'Description', 500),
    ...amount(input.amount),
    dueDate: date(input.dueDate),
    paymentType,
    status: 'draft',
    paymentReference: `0x${randomBytes(32).toString('hex')}`,
    createdAt,
  };
}
async function approve(
  db: Db,
  workspace: TeamWorkspace,
  target: string,
  actor: string,
) {
  const version = workspace.policyVersion ?? 0;
  const _id = `${workspace._id}:${target}:${version}`;
  // The policy version is part of the update predicate. Old decisions never satisfy a new policy.
  await db
    .collection<{ _id: string; version: number; approvals: string[] }>(
      'workspaceReviews',
    )
    .updateOne(
      { _id, version },
      { $setOnInsert: { version }, $addToSet: { approvals: actor } },
      { upsert: true },
    )
    .catch(async (error) => {
      if (!(error instanceof MongoServerError) || error.code !== 11000)
        throw error;
      await db
        .collection<{ _id: string; approvals: string[]; version: number }>(
          'workspaceReviews',
        )
        .updateOne({ _id, version }, { $addToSet: { approvals: actor } });
    });
}

async function participationAudit(
  db: Db,
  workspaceId: string,
  actor: string,
  action: string,
  instant: Date,
) {
  const _id = randomUUID();
  const collection = db.collection<{
    _id: string;
    workspaceId: string;
    actor: string;
    action: string;
    outcome: string;
    createdAt: string;
    expiresAt: Date;
  }>('workspaceAudit');
  await collection.insertOne({
    _id,
    workspaceId,
    actor,
    action,
    outcome: 'started',
    createdAt: instant.toISOString(),
    expiresAt: new Date(instant.getTime() + 365 * 86400000),
  });
  return (outcome: string) =>
    collection.updateOne({ _id }, { $set: { outcome } });
}

export function createParticipationRoutes(now: () => Date) {
  const app = new Hono<{ Variables: TeamVariables }>();
  app.get('/', async (c) => {
    const db = c.get('db');
    const actor = c.get('address');
    const [members, contracts, invoices] = await Promise.all([
      db
        .collection<Member>('workspaceMembers')
        .find({ address: actor, status: { $in: ['invited', 'active'] } })
        .limit(101)
        .toArray(),
      db
        .collection<{ _id: string; workspaceId: string; address: string }>(
          'contractors',
        )
        .find({ address: actor })
        .limit(101)
        .toArray(),
      db
        .collection<TeamInvoice>('invoices')
        .find({ submittedBy: actor })
        .sort({ createdAt: -1 })
        .limit(101)
        .toArray(),
    ]);
    const restrictions = await db
      .collection<Member>('workspaceMembers')
      .find({
        address: actor,
        workspaceId: {
          $in: contracts.slice(0, 100).map((row) => row.workspaceId),
        },
      })
      .toArray();
    const allowedContracts = contracts.slice(0, 100).filter((row) => {
      const member = restrictions.find(
        (m) => m.workspaceId === row.workspaceId,
      );
      return !member || member.status === 'active';
    });
    const workspaceIds = [
      ...new Set([...members, ...contracts].map((m) => m.workspaceId)),
    ];
    const workspaces = await db
      .collection<TeamWorkspace>('workspaces')
      .find({ _id: { $in: workspaceIds } })
      .toArray();
    return c.json({
      invitations: members.slice(0, 100).map((m) => ({
        ...m,
        workspaceName:
          workspaces.find((w) => w._id === m.workspaceId)?.name ?? 'Workspace',
      })),
      contractorWorkspaces: allowedContracts.map((m) => ({
        workspaceId: m.workspaceId,
        contractorId: m._id,
        name:
          workspaces.find((w) => w._id === m.workspaceId)?.name ?? 'Workspace',
      })),
      invoices: invoices.slice(0, 100).map((i) => ({
        _id: i._id,
        description: i.description,
        amount: i.amount,
        dueDate: i.dueDate,
        workspaceId: i.workspaceId,
        reviewRejected: i.reviewRejected ?? null,
        scheduleId: i.scheduleId ?? null,
        transactionHash: i.transactionHash ?? null,
      })),
      partial:
        members.length > 100 || contracts.length > 100 || invoices.length > 100,
    });
  });
  app.post('/:workspaceId/accept', async (c) => {
    const invitation = await c
      .get('db')
      .collection<Member>('workspaceMembers')
      .findOne({
        workspaceId: c.req.param('workspaceId'),
        address: c.get('address'),
        status: 'invited',
      });
    if (!invitation) teamFail(404, 'Invitation not found or no longer open.');
    const finish = await participationAudit(
      c.get('db'),
      invitation.workspaceId,
      c.get('address'),
      'participation/accept',
      now(),
    );
    const member = await c
      .get('db')
      .collection<Member>('workspaceMembers')
      .findOneAndUpdate(
        {
          workspaceId: c.req.param('workspaceId'),
          address: c.get('address'),
          status: 'invited',
        },
        { $set: { status: 'active' } },
        { returnDocument: 'after' },
      );
    if (!member) {
      await finish('rejected');
      teamFail(404, 'Invitation not found or no longer open.');
    }
    await finish('completed');
    return c.json({ ok: true });
  });
  app.post('/:workspaceId/invoices', async (c) => {
    const db = c.get('db');
    const workspaceId = c.req.param('workspaceId');
    const actor = c.get('address');
    const membership = await db
      .collection<Member>('workspaceMembers')
      .findOne({ workspaceId, address: actor });
    if (membership && membership.status !== 'active')
      teamFail(404, 'No contractor access to this workspace.');
    const contractor = await db
      .collection<{ _id: string; workspaceId: string; address: string }>(
        'contractors',
      )
      .findOne({ workspaceId, address: actor });
    if (
      !contractor ||
      !(await db
        .collection<TeamWorkspace>('workspaces')
        .findOne({ _id: workspaceId }))
    )
      teamFail(404, 'No contractor access to this workspace.');
    const input = await body(c.req.raw);
    const invoice = {
      ...(await invoiceTerms(
        db,
        workspaceId,
        { ...input, contractorId: contractor._id },
        now().toISOString(),
      )),
      submittedBy: actor,
    };
    const finish = await participationAudit(
      db,
      workspaceId,
      actor,
      'participation/invoices',
      now(),
    );
    await db.collection<TeamInvoice>('invoices').insertOne(invoice);
    await finish('completed');
    return c.json(invoice, 201);
  });
  return app;
}

export function createTeamOperations(options: {
  now: () => Date;
  verify: DirectVerifier;
}) {
  const app = new Hono<{ Variables: TeamVariables }>();
  const now = options.now;
  app.get('/operations', async (c) => {
    const db = c.get('db');
    const access = c.get('workspaceAccess');
    const workspaceId = access.workspace._id;
    const [members, plans, runs, invoiceRows, audit, preferences] =
      await Promise.all([
        recent<Member>(db, 'workspaceMembers', workspaceId),
        recent<RecurringPlan>(db, 'recurringPlans', workspaceId),
        recent<PayrollRun>(db, 'payrollRuns', workspaceId),
        recent<TeamInvoice>(db, 'invoices', workspaceId),
        recent<{
          _id: string;
          workspaceId: string;
          actor: string;
          action: string;
          outcome: string;
          createdAt: string;
        }>(db, 'workspaceAudit', workspaceId),
        db
          .collection<{
            _id: string;
            enabled: boolean;
            dueDays: number;
            seenAt?: string;
          }>('notificationPreferences')
          .findOne({ _id: `${workspaceId}:${c.get('address')}` }),
      ]);
    const reconciliation = await reconcileInvoices(
      db,
      invoiceRows.rows,
      access.workspace.owner,
      now(),
      options.verify,
    );
    const invoices = await Promise.all(
      reconciliation.items.map(async (i, index) => ({
        ...invoiceRows.rows[index],
        payment: i.payment,
        approval: await invoiceApproval(db, access, invoiceRows.rows[index]),
      })),
    );
    const payroll = await Promise.all(
      runs.rows.map(async (r) => ({
        ...r,
        approval: await reviewApproval(
          db,
          access.workspace,
          `run:${r._id}`,
          Math.max(1, access.workspace.requiredApprovals ?? 0),
        ),
      })),
    );
    const today = now().toISOString().slice(0, 10);
    const reminders: { id: string; kind: string; message: string }[] = [];
    if (preferences?.enabled) {
      const until = new Date(now().getTime() + preferences.dueDays * 86400000)
        .toISOString()
        .slice(0, 10);
      for (const i of invoices)
        if (
          !i.reviewRejected &&
          !i.scheduleId &&
          !i.transactionHash &&
          i.dueDate <= until
        )
          reminders.push({
            id: `invoice:${i._id}`,
            kind: i.dueDate < today ? 'overdue' : 'upcoming',
            message: `${i.description}: ${i.amount} MUSD due ${i.dueDate}${i.approval.ready ? '' : ' — awaiting approvals'}.`,
          });
      for (const p of plans.rows)
        if (!p.paused && p.nextDueDate <= until)
          reminders.push({
            id: `plan:${p._id}:${p.nextDueDate}`,
            kind: 'recurring',
            message: `${p.description}: prepare the ${p.nextDueDate} occurrence.`,
          });
    }
    const known = invoices.filter(
      (i) =>
        i.payment.status !== 'unavailable' &&
        i.payment.status !== 'conflict' &&
        i.payment.status !== 'awaiting_confirmation',
    );
    const sum = (
      key:
        | 'fundedBaseUnits'
        | 'claimedBaseUnits'
        | 'refundedBaseUnits'
        | 'outstandingBaseUnits',
    ) =>
      known.reduce((s, i) => s + BigInt(i.payment[key] ?? '0'), 0n).toString();
    return c.json({
      workspace: { ...access.workspace, role: access.role },
      members: members.rows,
      plans: plans.rows,
      runs: payroll,
      invoices,
      audit: audit.rows,
      preferences: preferences ?? { enabled: false, dueDays: 7 },
      reminders,
      asOf: now().toISOString(),
      reconciliation: reconciliation.reconciliation,
      partial:
        members.partial ||
        plans.partial ||
        runs.partial ||
        invoiceRows.partial ||
        audit.partial,
      report: {
        invoiceCount: invoices.length,
        unknownPayments: invoices.length - known.length,
        fundedBaseUnits: sum('fundedBaseUnits'),
        claimedBaseUnits: sum('claimedBaseUnits'),
        refundedBaseUnits: sum('refundedBaseUnits'),
        outstandingBaseUnits: sum('outstandingBaseUnits'),
        scope:
          'Latest 100 invoices; payment evidence only. Direct wallet transfers are separate from escrow funding. No billing revenue is measured.',
      },
    });
  });
  app.post('/members', async (c) => {
    const access = c.get('workspaceAccess');
    requireRole(access, ['owner']);
    const input = await body(c.req.raw);
    const wallet = address(input.address);
    if (wallet === access.workspace.owner)
      teamFail(409, 'The workspace owner already has access.');
    if (!roles.includes(input.role as (typeof roles)[number]))
      teamFail(400, 'Choose manager, approver, viewer or contractor.');
    const row: Member = {
      _id: `${access.workspace._id}:${wallet}`,
      workspaceId: access.workspace._id,
      address: wallet,
      role: input.role as Member['role'],
      status: 'invited',
      createdAt: now().toISOString(),
    };
    const existing = await c
      .get('db')
      .collection<Member>('workspaceMembers')
      .findOne({ _id: row._id });
    if (existing && existing.status !== 'revoked')
      teamFail(
        409,
        'Revoke the current invitation or membership before changing its role.',
      );
    try {
      await c
        .get('db')
        .collection<Member>('workspaceMembers')
        .replaceOne({ _id: row._id, status: 'revoked' }, row, { upsert: true });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000)
        teamFail(409, 'The membership changed. Refresh before inviting again.');
      throw error;
    }
    return c.json(row, 201);
  });
  app.post('/members/:memberId/revoke', async (c) => {
    const access = c.get('workspaceAccess');
    requireRole(access, ['owner']);
    const existing = await c
      .get('db')
      .collection<Member>('workspaceMembers')
      .findOne({
        _id: c.req.param('memberId'),
        workspaceId: access.workspace._id,
        status: { $ne: 'revoked' },
      });
    if (!existing) teamFail(404, 'Member not found.');
    // Invalidate first so an interrupted revocation cannot resurrect prior votes on reinvitation.
    await c
      .get('db')
      .collection<TeamWorkspace>('workspaces')
      .updateOne({ _id: access.workspace._id }, { $inc: { policyVersion: 1 } });
    const result = await c
      .get('db')
      .collection<Member>('workspaceMembers')
      .updateOne(
        {
          _id: c.req.param('memberId'),
          workspaceId: access.workspace._id,
          status: { $ne: 'revoked' },
        },
        { $set: { status: 'revoked' } },
      );
    if (!result.matchedCount) teamFail(404, 'Member not found.');
    return c.json({
      ok: true,
      message:
        'Membership revoked. Repeat current approval reviews before preparing more payments.',
    });
  });
  app.post('/approval-policy', async (c) => {
    const access = c.get('workspaceAccess');
    requireRole(access, ['owner']);
    const input = await body(c.req.raw);
    if (
      !Number.isInteger(input.requiredApprovals) ||
      Number(input.requiredApprovals) < 0 ||
      Number(input.requiredApprovals) > 5
    )
      teamFail(
        400,
        'Choose 0–5 required approvals. Submitted invoices and payroll runs always require at least one.',
      );
    await c
      .get('db')
      .collection<TeamWorkspace>('workspaces')
      .updateOne(
        { _id: access.workspace._id },
        {
          $set: { requiredApprovals: input.requiredApprovals as number },
          $inc: { policyVersion: 1 },
        },
      );
    return c.json({
      ok: true,
      message: 'Policy updated. Earlier approvals must be reviewed again.',
    });
  });
  app.post('/invoices/:invoiceId/review', async (c) => {
    const db = c.get('db');
    const access = c.get('workspaceAccess');
    requireRole(access, ['owner', 'approver']);
    const invoice = await db.collection<TeamInvoice>('invoices').findOne({
      _id: c.req.param('invoiceId'),
      workspaceId: access.workspace._id,
    });
    if (!invoice) teamFail(404, 'Invoice not found.');
    if (invoice.submittedBy === c.get('address'))
      teamFail(403, 'A submitted invoice requires an independent reviewer.');
    if (invoice.reviewRejected || invoice.scheduleId || invoice.transactionHash)
      teamFail(409, 'This invoice is rejected or already linked to a payment.');
    const input = await body(c.req.raw);
    if (input.decision === 'reject') {
      const result = await db.collection<TeamInvoice>('invoices').updateOne(
        {
          _id: invoice._id,
          scheduleId: { $exists: false },
          transactionHash: { $exists: false },
        },
        {
          $set: {
            reviewRejected: text(input.reason, 'Rejection reason', 300),
          },
        },
      );
      if (!result.matchedCount)
        teamFail(409, 'Payment linking started. Refresh this invoice.');
    } else if (input.decision === 'approve')
      await approve(
        db,
        access.workspace,
        `invoice:${invoice._id}`,
        c.get('address'),
      );
    else teamFail(400, 'Choose approve or reject.');
    return c.json({ ok: true });
  });
  app.get('/invoices/:invoiceId/payment-plan', async (c) => {
    const access = c.get('workspaceAccess');
    requireRole(access, ['owner']);
    const invoice = await c
      .get('db')
      .collection<TeamInvoice>('invoices')
      .findOne({
        _id: c.req.param('invoiceId'),
        workspaceId: access.workspace._id,
      });
    if (!invoice) teamFail(404, 'Invoice not found.');
    if (invoice.transactionHash || invoice.scheduleId)
      teamFail(
        409,
        'Payment evidence is already linked. Check it before making another payment.',
      );
    const approval = await invoiceApproval(c.get('db'), access, invoice);
    if (!approval.ready)
      teamFail(
        409,
        'This invoice requires current independent workspace approvals.',
      );
    return c.json({ ...invoice, approval });
  });
  app.post('/payroll-runs', async (c) => {
    const db = c.get('db');
    const access = c.get('workspaceAccess');
    requireRole(access, ['owner', 'manager']);
    const input = await body(c.req.raw);
    if (
      !Array.isArray(input.invoiceIds) ||
      !input.invoiceIds.length ||
      input.invoiceIds.length > 50 ||
      input.invoiceIds.some((i) => typeof i !== 'string') ||
      new Set(input.invoiceIds).size !== input.invoiceIds.length
    )
      teamFail(400, 'Select 1–50 distinct invoices.');
    const invoices = await db
      .collection<TeamInvoice>('invoices')
      .find({
        _id: { $in: input.invoiceIds as string[] },
        workspaceId: access.workspace._id,
      })
      .toArray();
    if (
      invoices.length !== input.invoiceIds.length ||
      invoices.some(
        (i) => i.reviewRejected || i.transactionHash || i.scheduleId,
      )
    )
      teamFail(
        409,
        'Choose existing, unlinked invoices which have not been rejected.',
      );
    const row: PayrollRun = {
      _id: randomUUID(),
      workspaceId: access.workspace._id,
      name: text(input.name, 'Payroll run name'),
      invoiceIds: input.invoiceIds as string[],
      totalBaseUnits: invoices
        .reduce((s, i) => s + BigInt(i.amountBaseUnits), 0n)
        .toString(),
      createdAt: now().toISOString(),
    };
    try {
      await db.collection<PayrollRun>('payrollRuns').insertOne(row);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000)
        teamFail(
          409,
          'An invoice is already assigned to another payroll run. Review that run instead.',
        );
      throw error;
    }
    return c.json(row, 201);
  });
  app.post('/payroll-runs/:runId/approve', async (c) => {
    const access = c.get('workspaceAccess');
    requireRole(access, ['owner', 'approver']);
    const run = await c
      .get('db')
      .collection<PayrollRun>('payrollRuns')
      .findOne({
        _id: c.req.param('runId'),
        workspaceId: access.workspace._id,
      });
    if (!run) teamFail(404, 'Payroll run not found.');
    await approve(
      c.get('db'),
      access.workspace,
      `run:${run._id}`,
      c.get('address'),
    );
    return c.json({ ok: true });
  });
  app.get('/payroll-runs/:runId/payment-plan', async (c) => {
    const db = c.get('db');
    const access = c.get('workspaceAccess');
    requireRole(access, ['owner']);
    const run = await db.collection<PayrollRun>('payrollRuns').findOne({
      _id: c.req.param('runId'),
      workspaceId: access.workspace._id,
    });
    if (!run) teamFail(404, 'Payroll run not found.');
    const approval = await reviewApproval(
      db,
      access.workspace,
      `run:${run._id}`,
      Math.max(1, access.workspace.requiredApprovals ?? 0),
    );
    if (!approval.ready)
      teamFail(409, 'This payroll run requires current workspace approvals.');
    const invoices = await db
      .collection<TeamInvoice>('invoices')
      .find({ _id: { $in: run.invoiceIds }, workspaceId: access.workspace._id })
      .toArray();
    if (invoices.length !== run.invoiceIds.length)
      teamFail(409, 'A payroll invoice is unavailable.');
    for (const invoice of invoices)
      if (!(await invoiceApproval(db, access, invoice)).ready)
        teamFail(
          409,
          'One or more invoices require approval or were rejected.',
        );
    return c.json({
      run,
      invoices,
      message:
        'Review and sign each payment separately. Existing payment evidence must be checked before resuming.',
    });
  });
  app.post('/recurring-plans', async (c) => {
    const db = c.get('db');
    const access = c.get('workspaceAccess');
    requireRole(access, ['owner', 'manager']);
    const input = await body(c.req.raw);
    const terms = await invoiceTerms(
      db,
      access.workspace._id,
      { ...input, dueDate: input.nextDueDate },
      now().toISOString(),
    );
    if (
      !['weekly', 'monthly'].includes(String(input.cadence)) ||
      !Number.isInteger(input.interval) ||
      Number(input.interval) < 1 ||
      Number(input.interval) > 12
    )
      teamFail(400, 'Choose weekly/monthly cadence and interval 1–12.');
    const row: RecurringPlan = {
      _id: randomUUID(),
      workspaceId: terms.workspaceId,
      contractorId: terms.contractorId,
      recipient: terms.recipient,
      description: terms.description,
      amount: terms.amount,
      amountBaseUnits: terms.amountBaseUnits,
      paymentType: terms.paymentType!,
      nextDueDate: terms.dueDate,
      cadence: input.cadence as RecurringPlan['cadence'],
      interval: input.interval as number,
      anchorDay: Number(terms.dueDate.slice(8)),
      paused: false,
      createdAt: terms.createdAt,
    };
    nextOccurrence(row);
    await db.collection<RecurringPlan>('recurringPlans').insertOne(row);
    return c.json(row, 201);
  });
  app.post('/recurring-plans/:planId/pause', async (c) => {
    const access = c.get('workspaceAccess');
    requireRole(access, ['owner', 'manager']);
    const input = await body(c.req.raw);
    if (typeof input.paused !== 'boolean')
      teamFail(400, 'Choose whether to pause this plan.');
    const result = await c
      .get('db')
      .collection<RecurringPlan>('recurringPlans')
      .updateOne(
        { _id: c.req.param('planId'), workspaceId: access.workspace._id },
        { $set: { paused: input.paused } },
      );
    if (!result.matchedCount) teamFail(404, 'Recurring plan not found.');
    return c.json({ ok: true });
  });
  app.post('/recurring-plans/:planId/prepare', async (c) => {
    const db = c.get('db');
    const access = c.get('workspaceAccess');
    requireRole(access, ['owner', 'manager']);
    const input = await body(c.req.raw);
    const plan = await db.collection<RecurringPlan>('recurringPlans').findOne({
      _id: c.req.param('planId'),
      workspaceId: access.workspace._id,
    });
    if (!plan) teamFail(404, 'Recurring plan not found.');
    // The caller supplies the date it reviewed. Retries cannot silently prepare the following occurrence.
    const dueDate = date(input.dueDate);
    const recurrenceKey = `${plan._id}:${dueDate}`;
    const existing = await db
      .collection<TeamInvoice>('invoices')
      .findOne({ recurrenceKey, workspaceId: access.workspace._id });
    if (existing) {
      if (plan.nextDueDate === dueDate)
        await db
          .collection<RecurringPlan>('recurringPlans')
          .updateOne(
            { _id: plan._id, nextDueDate: dueDate },
            { $set: { nextDueDate: nextOccurrence(plan) } },
          );
      return c.json(existing);
    }
    if (plan.paused || dueDate !== plan.nextDueDate)
      teamFail(
        409,
        'This plan is paused or its next occurrence changed. Refresh before preparing.',
      );
    const next = nextOccurrence(plan);
    const terms = await invoiceTerms(
      db,
      access.workspace._id,
      { ...plan, dueDate },
      now().toISOString(),
    );
    // Deterministic ID/reference and a unique recurrence key make concurrent/crash retries idempotent.
    const hash = createHash('sha256').update(recurrenceKey).digest('hex');
    const row: TeamInvoice = {
      ...terms,
      _id: `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`,
      paymentReference: `0x${hash}`,
      recurrenceKey,
    };
    await db
      .collection<TeamInvoice>('invoices')
      .updateOne({ recurrenceKey }, { $setOnInsert: row }, { upsert: true })
      .catch(async (error) => {
        if (
          !(error instanceof MongoServerError) ||
          error.code !== 11000 ||
          !(await db
            .collection<TeamInvoice>('invoices')
            .findOne({ recurrenceKey }))
        )
          throw error;
      });
    await db
      .collection<RecurringPlan>('recurringPlans')
      .updateOne(
        { _id: plan._id, nextDueDate: dueDate },
        { $set: { nextDueDate: next } },
      );
    return c.json(
      await db.collection<TeamInvoice>('invoices').findOne({ recurrenceKey }),
      201,
    );
  });
  app.post('/notification-preferences', async (c) => {
    const access = c.get('workspaceAccess');
    const input = await body(c.req.raw);
    if (
      typeof input.enabled !== 'boolean' ||
      !Number.isInteger(input.dueDays) ||
      Number(input.dueDays) < 1 ||
      Number(input.dueDays) > 30
    )
      teamFail(400, 'Choose opt-in and a reminder window of 1–30 days.');
    await c
      .get('db')
      .collection<{
        _id: string;
        workspaceId: string;
        enabled: boolean;
        dueDays: number;
      }>('notificationPreferences')
      .updateOne(
        { _id: `${access.workspace._id}:${c.get('address')}` },
        {
          $set: {
            workspaceId: access.workspace._id,
            enabled: input.enabled,
            dueDays: input.dueDays as number,
          },
        },
        { upsert: true },
      );
    return c.json({ ok: true });
  });
  app.get('/report.csv', async (c) => {
    const access = c.get('workspaceAccess');
    const db = c.get('db');
    const source = await recent<TeamInvoice>(
      db,
      'invoices',
      access.workspace._id,
    );
    const result = await reconcileInvoices(
      db,
      source.rows,
      access.workspace.owner,
      now(),
      options.verify,
    );
    const rows = [
      [
        'scope',
        source.partial
          ? 'PARTIAL: latest 100 invoices'
          : 'All workspace invoices',
        'generated',
        now().toISOString(),
      ],
      [
        'id',
        'description',
        'recipient',
        'MUSD',
        'due',
        'payment status',
        'funded base units',
        'claimed base units',
        'refunded base units',
        'outstanding base units',
      ],
      ...result.items.map((i, index) => [
        i._id,
        source.rows[index].description,
        i.recipient,
        source.rows[index].amount,
        source.rows[index].dueDate,
        i.payment.status,
        i.payment.fundedBaseUnits ?? '',
        i.payment.claimedBaseUnits ?? '',
        i.payment.refundedBaseUnits ?? '',
        i.payment.outstandingBaseUnits ?? '',
      ]),
    ];
    return c.body(
      rows.map((row) => row.map(csvCell).join(',')).join('\r\n'),
      200,
      {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition':
          'attachment; filename="runway-workspace-report.csv"',
        'cache-control': 'no-store',
      },
    );
  });
  return app;
}
