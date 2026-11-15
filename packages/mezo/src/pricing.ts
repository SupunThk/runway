const MUSD_UNIT = 10n ** 18n;
const BPS_DENOMINATOR = 10_000n;

/** Off-chain Team workspace subscription. Not billed during the testnet pilot. */
export const WORKSPACE_MONTHLY_FEE_MUSD = 49n * MUSD_UNIT;
/** Default on-chain RunwayPayments schedule fee: 25 bps (0.25%), capped per schedule. */
export const SCHEDULE_FEE_BPS = 25n;
export const SCHEDULE_FEE_CAP_MUSD = 25n * MUSD_UNIT;
/** Hard ceilings enforced by the contract; the owner can never exceed them. */
export const MAX_SCHEDULE_FEE_BPS = 100n;
export const MAX_SCHEDULE_FEE_CAP_MUSD = 100n * MUSD_UNIT;

export type ScheduleFeeConfig = {
  feeBps: bigint;
  feeCapBaseUnits: bigint;
};
export const DEFAULT_SCHEDULE_FEE: ScheduleFeeConfig = {
  feeBps: SCHEDULE_FEE_BPS,
  feeCapBaseUnits: SCHEDULE_FEE_CAP_MUSD,
};

export type ScheduleFeeBreakdown = {
  principalBaseUnits: bigint;
  feeBps: number;
  feeCapBaseUnits: bigint;
  feeBaseUnits: bigint;
  recipientReceivesBaseUnits: bigint;
  totalSenderDebitBaseUnits: bigint;
};

export type PayrollRunFeeBreakdown = {
  paymentCount: number;
  scheduledCount: number;
  principalBaseUnits: bigint;
  feeBaseUnits: bigint;
  totalSenderDebitBaseUnits: bigint;
};

export const RUNWAY_BUSINESS_MODEL = {
  currency: 'MUSD' as const,
  scheduleFee: {
    name: 'Payment schedule fee',
    feeBps: Number(SCHEDULE_FEE_BPS),
    feeCapBaseUnits: SCHEDULE_FEE_CAP_MUSD.toString(),
    collection: 'on-chain' as const,
    summary:
      '0.25% of each funded RunwayPayments schedule, capped at 25 MUSD, charged on top of the funded amount at creation. The recipient receives 100% of the schedule; the fee is not refunded on cancellation.',
  },
  free: {
    name: 'Free',
    summary:
      'One-time MUSD transfers, public /proof verification, Mezo borrowing through Runway and Ask Runway carry no Runway fee. Only Mezo network gas and Mezo protocol borrowing fees apply.',
  },
  teamWorkspace: {
    name: 'Team workspace',
    monthlyFeeBaseUnits: WORKSPACE_MONTHLY_FEE_MUSD.toString(),
    collection: 'off-chain' as const,
    summary:
      '49 MUSD per active team workspace per month for approvals, payroll runs, recurring plans and client payment links. Not billed during the testnet pilot.',
  },
} as const;

function validConfig(config: ScheduleFeeConfig) {
  if (
    config.feeBps < 0n ||
    config.feeBps > MAX_SCHEDULE_FEE_BPS ||
    config.feeCapBaseUnits < 0n ||
    config.feeCapBaseUnits > MAX_SCHEDULE_FEE_CAP_MUSD
  )
    throw new Error('Schedule fee configuration is outside contract limits.');
  return config;
}

/** Exact mirror of RunwayPayments.scheduleFee: min(floor(amount × bps / 10,000), cap). */
export function scheduleFee(
  amountBaseUnits: bigint,
  config: ScheduleFeeConfig = DEFAULT_SCHEDULE_FEE,
) {
  if (amountBaseUnits < 0n)
    throw new Error('Payment amount must be nonnegative');
  const { feeBps, feeCapBaseUnits } = validConfig(config);
  if (feeBps === 0n) return 0n;
  const fee = (amountBaseUnits * feeBps) / BPS_DENOMINATOR;
  return fee > feeCapBaseUnits ? feeCapBaseUnits : fee;
}

export function calculateScheduleFee(
  amountBaseUnits: bigint,
  config: ScheduleFeeConfig = DEFAULT_SCHEDULE_FEE,
): ScheduleFeeBreakdown {
  const feeBaseUnits = scheduleFee(amountBaseUnits, config);
  return {
    principalBaseUnits: amountBaseUnits,
    feeBps: Number(config.feeBps),
    feeCapBaseUnits: config.feeCapBaseUnits,
    feeBaseUnits,
    recipientReceivesBaseUnits: amountBaseUnits,
    totalSenderDebitBaseUnits: amountBaseUnits + feeBaseUnits,
  };
}

/** One-time transfers are free; each scheduled payment is capped independently. */
export function calculatePayrollRunFee(
  payments: readonly { amountBaseUnits: bigint; scheduled: boolean }[],
  config: ScheduleFeeConfig = DEFAULT_SCHEDULE_FEE,
): PayrollRunFeeBreakdown {
  let principalBaseUnits = 0n;
  let feeBaseUnits = 0n;
  let scheduledCount = 0;
  for (const payment of payments) {
    principalBaseUnits += payment.amountBaseUnits;
    if (!payment.scheduled) continue;
    scheduledCount++;
    feeBaseUnits += scheduleFee(payment.amountBaseUnits, config);
  }
  return {
    paymentCount: payments.length,
    scheduledCount,
    principalBaseUnits,
    feeBaseUnits,
    totalSenderDebitBaseUnits: principalBaseUnits + feeBaseUnits,
  };
}

export function estimateWorkspaceRevenueEquivalent(params: {
  workspaces: number;
  fundedBaseUnits: bigint | null;
}) {
  const workspaceCount = BigInt(Math.max(0, Math.trunc(params.workspaces)));
  const monthlySubscriptionEquivalentBaseUnits =
    workspaceCount * WORKSPACE_MONTHLY_FEE_MUSD;
  const volumeFeeEquivalentBaseUnits =
    params.fundedBaseUnits !== null && params.fundedBaseUnits >= 0n
      ? (params.fundedBaseUnits * SCHEDULE_FEE_BPS) / BPS_DENOMINATOR
      : null;
  return {
    workspaceMonthlyFeeBaseUnits: WORKSPACE_MONTHLY_FEE_MUSD.toString(),
    scheduleFeeBps: Number(SCHEDULE_FEE_BPS),
    scheduleFeeCapBaseUnits: SCHEDULE_FEE_CAP_MUSD.toString(),
    monthlySubscriptionEquivalentBaseUnits:
      monthlySubscriptionEquivalentBaseUnits.toString(),
    volumeFeeEquivalentBaseUnits:
      volumeFeeEquivalentBaseUnits !== null
        ? volumeFeeEquivalentBaseUnits.toString()
        : null,
  };
}
