export type WorkspaceRole =
  'owner' | 'manager' | 'approver' | 'viewer' | 'contractor';
export type Approval = {
  required: number;
  approvedBy: string[];
  ready: boolean;
  rejected: boolean;
  pendingRunId?: string;
};
export type TeamInvoice = {
  _id: string;
  workspaceId: string;
  contractorId: string;
  recipient: string;
  description: string;
  amount: string;
  amountBaseUnits: string;
  dueDate: string;
  status: 'draft';
  paymentType?: 'schedule' | 'one-time';
  paymentReference?: string;
  createdAt: string;
  submittedBy?: string;
  recurrenceKey?: string;
  reviewRejected?: string;
  scheduleId?: string;
  transactionHash?: `0x${string}`;
  approval?: Approval;
  payment?: {
    status: string;
    scheduleId?: string;
    transactionHash?: string;
    fundedBaseUnits?: string;
    claimedBaseUnits?: string;
    refundedBaseUnits?: string;
    outstandingBaseUnits?: string;
  };
};
export type RecurringPlan = {
  _id: string;
  workspaceId: string;
  contractorId: string;
  recipient: string;
  description: string;
  amount: string;
  amountBaseUnits: string;
  paymentType: 'schedule' | 'one-time';
  cadence: 'weekly' | 'monthly';
  interval: number;
  anchorDay: number;
  nextDueDate: string;
  paused: boolean;
  createdAt: string;
};
export type PayrollRun = {
  _id: string;
  workspaceId: string;
  name: string;
  invoiceIds: string[];
  totalBaseUnits: string;
  createdAt: string;
  approval?: Approval;
};
export function validUtcDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value &&
    value >= '2000-01-01' &&
    value <= '2199-12-31'
  );
}
export function nextOccurrence(
  plan: Pick<
    RecurringPlan,
    'nextDueDate' | 'cadence' | 'interval' | 'anchorDay'
  >,
): string {
  if (
    !validUtcDate(plan.nextDueDate) ||
    !Number.isInteger(plan.interval) ||
    plan.interval < 1 ||
    plan.interval > 12 ||
    !Number.isInteger(plan.anchorDay) ||
    plan.anchorDay < 1 ||
    plan.anchorDay > 31
  )
    throw new Error('Invalid recurring plan.');
  const date = new Date(`${plan.nextDueDate}T00:00:00Z`);
  if (plan.cadence === 'weekly')
    date.setUTCDate(date.getUTCDate() + 7 * plan.interval);
  else if (plan.cadence === 'monthly') {
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + plan.interval);
    const last = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(plan.anchorDay, last));
  } else throw new Error('Invalid cadence.');
  const result = date.toISOString().slice(0, 10);
  if (!validUtcDate(result))
    throw new Error('Recurrence exceeds the supported date range.');
  return result;
}
export type ForecastEntry = {
  id: string;
  date: string;
  amountBaseUnits: string;
  direction: 'in' | 'out';
  assumed: boolean;
  label: string;
};
export function cashForecast(input: {
  start: string;
  days: number;
  walletBaseUnits: string;
  reserveBaseUnits: string;
  entries: ForecastEntry[];
  includeExpected: boolean;
  incomplete: boolean;
}) {
  const amount = (value: string) => {
    if (!/^\d{1,78}$/.test(value) || BigInt(value) > (1n << 256n) - 1n)
      throw new Error('Invalid cash amount.');
    return BigInt(value);
  };
  if (
    !validUtcDate(input.start) ||
    !Number.isInteger(input.days) ||
    input.days < 1 ||
    input.days > 365 ||
    input.entries.length > 5000
  )
    throw new Error('Invalid forecast range.');
  let cash = amount(input.walletBaseUnits) - amount(input.reserveBaseUnits);
  let minimum = cash;
  let firstShortfall: string | null = cash < 0n ? input.start : null;
  const dated = new Map<string, bigint>();
  const seen = new Set<string>();
  for (const entry of input.entries) {
    if (seen.has(entry.id)) throw new Error('Duplicate forecast entry.');
    seen.add(entry.id);
    if (!validUtcDate(entry.date) || !['in', 'out'].includes(entry.direction))
      throw new Error('Invalid forecast entry.');
    if (entry.assumed && !input.includeExpected) continue;
    const date = entry.date < input.start ? input.start : entry.date;
    dated.set(
      date,
      (dated.get(date) ?? 0n) +
        amount(entry.amountBaseUnits) * (entry.direction === 'in' ? 1n : -1n),
    );
  }
  const days: { date: string; usableBaseUnits: string }[] = [];
  const date = new Date(`${input.start}T00:00:00Z`);
  for (let i = 0; i < input.days; i++) {
    const key = date.toISOString().slice(0, 10);
    cash += dated.get(key) ?? 0n;
    minimum = cash < minimum ? cash : minimum;
    if (cash < 0n && !firstShortfall) firstShortfall = key;
    days.push({ date: key, usableBaseUnits: cash.toString() });
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return {
    days,
    minimumBaseUnits: minimum.toString(),
    endingBaseUnits: cash.toString(),
    firstShortfall,
    incomplete: input.incomplete,
  };
}

export function csvCell(value: unknown) {
  const text = String(value ?? '');
  // Spreadsheet exports must not turn private names or descriptions into formulas.
  return `"${(/^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
}
