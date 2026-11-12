import { HTTPException } from 'hono/http-exception';
import type { Db } from 'mongodb';
import type {
  WorkspaceRole,
  TeamInvoice,
  Approval,
} from '../../../packages/mezo/src/team-operations.ts';

export type TeamWorkspace = {
  _id: string;
  owner: string;
  name: string;
  createdAt: string;
  requiredApprovals?: number;
  policyVersion?: number;
};
export type Member = {
  _id: string;
  workspaceId: string;
  address: string;
  role: Exclude<WorkspaceRole, 'owner'>;
  status: 'invited' | 'active' | 'revoked';
  createdAt: string;
};
export type WorkspaceAccess = { workspace: TeamWorkspace; role: WorkspaceRole };
export type TeamVariables = {
  db: Db;
  address: string;
  workspaceAccess: WorkspaceAccess;
};
export function teamFail(
  status: 400 | 403 | 404 | 409 | 503,
  message: string,
): never {
  throw new HTTPException(status, { message });
}
export async function workspaceAccess(
  db: Db,
  workspaceId: string,
  address: string,
  allowContractor = false,
): Promise<WorkspaceAccess> {
  const workspace = await db
    .collection<TeamWorkspace>('workspaces')
    .findOne({ _id: workspaceId });
  if (!workspace) return teamFail(404, 'Workspace not found.');
  if (workspace.owner === address) return { workspace, role: 'owner' };
  const member = await db
    .collection<Member>('workspaceMembers')
    .findOne({ workspaceId, address, status: 'active' });
  if (!member || (!allowContractor && member.role === 'contractor'))
    return teamFail(404, 'Workspace not found.');
  return { workspace, role: member.role };
}
export function requireRole(access: WorkspaceAccess, roles: WorkspaceRole[]) {
  if (!roles.includes(access.role))
    teamFail(403, 'Your workspace role does not permit this action.');
}
export async function invoiceApproval(
  db: Db,
  access: WorkspaceAccess,
  invoice: TeamInvoice,
): Promise<Approval> {
  const approval = await reviewApproval(
    db,
    access.workspace,
    `invoice:${invoice._id}`,
    invoice.submittedBy
      ? Math.max(1, access.workspace.requiredApprovals ?? 0)
      : (access.workspace.requiredApprovals ?? 0),
    invoice.submittedBy,
    Boolean(invoice.reviewRejected),
  );
  const run = await db
    .collection<{ _id: string; workspaceId: string; invoiceIds: string[] }>(
      'payrollRuns',
    )
    .findOne({ workspaceId: access.workspace._id, invoiceIds: invoice._id });
  if (
    run &&
    !(
      await reviewApproval(
        db,
        access.workspace,
        `run:${run._id}`,
        Math.max(1, access.workspace.requiredApprovals ?? 0),
      )
    ).ready
  )
    return { ...approval, ready: false, pendingRunId: run._id };
  return approval;
}
export async function reviewApproval(
  db: Db,
  workspace: TeamWorkspace,
  target: string,
  required: number,
  exclude?: string,
  rejected = false,
): Promise<Approval> {
  const review = await db
    .collection<{ _id: string; version: number; approvals: string[] }>(
      'workspaceReviews',
    )
    .findOne({
      _id: `${workspace._id}:${target}:${workspace.policyVersion ?? 0}`,
      version: workspace.policyVersion ?? 0,
    });
  const candidates = [...new Set(review?.approvals ?? [])].filter(
    (a) => a !== exclude,
  );
  const active = candidates.length
    ? await db
        .collection<Member>('workspaceMembers')
        .find({
          workspaceId: workspace._id,
          address: { $in: candidates },
          status: 'active',
          role: 'approver',
        })
        .toArray()
    : [];
  const approvedBy = candidates.filter(
    (a) => a === workspace.owner || active.some((m) => m.address === a),
  );
  return {
    required,
    approvedBy,
    ready: !rejected && approvedBy.length >= required,
    rejected,
  };
}
export async function requireInvoiceApproval(
  db: Db,
  access: WorkspaceAccess,
  invoice: TeamInvoice,
) {
  if (!(await invoiceApproval(db, access, invoice)).ready)
    teamFail(
      409,
      'This invoice requires current independent workspace approvals before preparing or linking a payment.',
    );
}
