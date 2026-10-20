export const DAY_SECONDS = 86_400n;
export const MONTH_SECONDS = 30n * DAY_SECONDS;

export type PlannerSchedule = {
  sender: string;
  total: bigint;
  claimed: bigint;
  start: bigint;
  end: bigint;
  cancelled: boolean;
};

function scheduleRate(schedule: PlannerSchedule) {
  const duration = schedule.end - schedule.start;
  if (duration <= 0n || schedule.total <= 0n)
    throw new Error('Invalid planner schedule.');
  return (schedule.total + duration - 1n) / duration;
}

/** Current sent streams only; future-starting schedules are disclosed separately. */
export function activeSchedules(
  rows: readonly PlannerSchedule[],
  account: string,
  chainTime: bigint,
) {
  return rows.filter(
    (s) =>
      s.sender.toLowerCase() === account.toLowerCase() &&
      !s.cancelled &&
      s.total > 0n &&
      s.end > s.start &&
      s.start <= chainTime &&
      chainTime < s.end,
  );
}

/** Round each positive stream up to the next base unit per second. */
export function paymentRatePerSecond(active: readonly PlannerSchedule[]) {
  return active.reduce((sum, s) => sum + scheduleRate(s), 0n);
}

/** Every current stream remains escrow-funded until the earliest end. */
export function fundedThrough(
  active: readonly PlannerSchedule[],
): bigint | undefined {
  return active.reduce<bigint | undefined>(
    (earliest, s) =>
      earliest === undefined || s.end < earliest ? s.end : earliest,
    undefined,
  );
}

/** Wallet renewal spending begins separately at each stream's escrow end. */
export function payrollCoveredUntil(
  active: readonly PlannerSchedule[],
  walletMusd: bigint,
): bigint | undefined {
  if (walletMusd < 0n) throw new Error('Wallet amount must be nonnegative.');
  if (!active.length) return undefined;
  const events = new Map<bigint, bigint>();
  for (const s of active)
    events.set(s.end, (events.get(s.end) ?? 0n) + scheduleRate(s));
  const ends = [...events.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  let remaining = walletMusd;
  let rate = 0n;
  let previous = ends[0];
  for (const end of ends) {
    const cost = rate * (end - previous);
    if (cost > remaining) return previous + remaining / rate;
    remaining -= cost;
    rate += events.get(end)!;
    previous = end;
  }
  return previous + remaining / rate;
}

export function borrowingHeadroom(p: {
  collateral: bigint;
  debt: bigint;
  price: bigint;
  dropPercent: number;
  targetRatio: bigint;
  minimumRatio: bigint;
}) {
  if (
    p.collateral < 0n ||
    p.debt < 0n ||
    p.price <= 0n ||
    p.minimumRatio <= 0n ||
    p.targetRatio <= p.minimumRatio
  )
    throw new Error('Invalid borrowing snapshot or target ratio.');
  if (
    !Number.isInteger(p.dropPercent) ||
    p.dropPercent < 0 ||
    p.dropPercent > 100
  )
    throw new Error('Price drop must be a whole percentage from 0 to 100.');
  const stressedPrice = (p.price * BigInt(100 - p.dropPercent)) / 100n;
  const maxDebt = (p.collateral * stressedPrice) / p.targetRatio;
  return {
    stressedPrice,
    maxDebt,
    headroom: maxDebt > p.debt ? maxDebt - p.debt : 0n,
  };
}

export function requiredForMonths(rate: bigint, months: number) {
  if (rate < 0n || !Number.isInteger(months) || months < 1 || months > 24)
    throw new Error('Use a nonnegative payment rate and 1–24 whole months.');
  return rate * MONTH_SECONDS * BigInt(months);
}

export function monthsCovered(
  amount: bigint,
  rate: bigint,
): bigint | undefined {
  if (amount < 0n || rate < 0n)
    throw new Error('Amount and payment rate must be nonnegative.');
  return rate === 0n ? undefined : amount / (rate * MONTH_SECONDS);
}
