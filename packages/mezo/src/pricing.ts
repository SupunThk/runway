const MUSD_UNIT = 10n ** 18n;
const BPS_DENOMINATOR = 10_000n;

export const WORKSPACE_MONTHLY_FEE_MUSD = 49n * MUSD_UNIT;
export const SCHEDULE_FEE_BPS = 25n; // 0.25%
export const SCHEDULE_FEE_CAP_MUSD = 25n * MUSD_UNIT;

export type RunwayPricingTier = 'solo' | 'team';

export type ScheduleFeeBreakdown = {
  tier: RunwayPricingTier;
  principalBaseUnits: bigint;
  feeBps: number;
  feeCapBaseUnits: bigint;
  standardFeeBaseUnits: bigint;
  chargedFeeBaseUnits: bigint;
  waivedFeeBaseUnits: bigint;
  recipientReceivesBaseUnits: bigint;
  totalSenderDebitBaseUnits: bigint;
  waivedOnTestnet: boolean;
};

export type PayrollRunFeeBreakdown = {
  paymentCount: number;
  principalBaseUnits: bigint;
  feeBps: number;
  feeCapBaseUnits: bigint;
  standardFeeBaseUnits: bigint;
  chargedFeeBaseUnits: bigint;
  waivedFeeBaseUnits: bigint;
  totalSenderDebitBaseUnits: bigint;
  waivedOnTestnet: boolean;
};

export const RUNWAY_BUSINESS_MODEL = {
  currency: 'MUSD' as const,
  soloTier: {
    name: 'Solo & Open Protocol',
    monthlyWorkspaceFeeBaseUnits: '0',
    scheduleFeeBps: 0,
    scheduleFeeCapBaseUnits: '0',
    summary:
      '0 MUSD/month and 0 bps on direct 1-to-1 RunwayPayments schedules, one-time transfers, public /proof verification, and BTC-backed borrowing.',
  },
  teamTier: {
    name: 'Team Operations & Payroll',
    monthlyWorkspaceFeeBaseUnits: WORKSPACE_MONTHLY_FEE_MUSD.toString(),
    scheduleFeeBps: Number(SCHEDULE_FEE_BPS),
    scheduleFeeCapBaseUnits: SCHEDULE_FEE_CAP_MUSD.toString(),
    summary:
      '49 MUSD/month per active team workspace plus a 25 bps (0.25%) schedule and payroll coordination fee capped at 25 MUSD per payment. 100% waived on Mezo Testnet.',
  },
} as const;

export function calculateScheduleFee(
  amountBaseUnits: bigint,
  options?: { tier?: RunwayPricingTier; waiveOnTestnet?: boolean },
): ScheduleFeeBreakdown {
  if (amountBaseUnits < 0n) {
    throw new Error('Payment amount must be nonnegative');
  }
  const tier = options?.tier ?? 'team';
  const waivedOnTestnet = options?.waiveOnTestnet ?? true;
  if (tier === 'solo') {
    return {
      tier,
      principalBaseUnits: amountBaseUnits,
      feeBps: 0,
      feeCapBaseUnits: 0n,
      standardFeeBaseUnits: 0n,
      chargedFeeBaseUnits: 0n,
      waivedFeeBaseUnits: 0n,
      recipientReceivesBaseUnits: amountBaseUnits,
      totalSenderDebitBaseUnits: amountBaseUnits,
      waivedOnTestnet,
    };
  }
  const uncappedFee = (amountBaseUnits * SCHEDULE_FEE_BPS) / BPS_DENOMINATOR;
  const standardFeeBaseUnits =
    uncappedFee > SCHEDULE_FEE_CAP_MUSD ? SCHEDULE_FEE_CAP_MUSD : uncappedFee;
  const chargedFeeBaseUnits = waivedOnTestnet ? 0n : standardFeeBaseUnits;
  const waivedFeeBaseUnits = standardFeeBaseUnits - chargedFeeBaseUnits;
  return {
    tier,
    principalBaseUnits: amountBaseUnits,
    feeBps: Number(SCHEDULE_FEE_BPS),
    feeCapBaseUnits: SCHEDULE_FEE_CAP_MUSD,
    standardFeeBaseUnits,
    chargedFeeBaseUnits,
    waivedFeeBaseUnits,
    recipientReceivesBaseUnits: amountBaseUnits,
    totalSenderDebitBaseUnits: amountBaseUnits + chargedFeeBaseUnits,
    waivedOnTestnet,
  };
}

export function calculatePayrollRunFee(
  invoiceAmountsBaseUnits: readonly bigint[],
  options?: { waiveOnTestnet?: boolean },
): PayrollRunFeeBreakdown {
  const waivedOnTestnet = options?.waiveOnTestnet ?? true;
  let principalBaseUnits = 0n;
  let standardFeeBaseUnits = 0n;
  for (const amount of invoiceAmountsBaseUnits) {
    const item = calculateScheduleFee(amount, {
      tier: 'team',
      waiveOnTestnet: waivedOnTestnet,
    });
    principalBaseUnits += item.principalBaseUnits;
    standardFeeBaseUnits += item.standardFeeBaseUnits;
  }
  const chargedFeeBaseUnits = waivedOnTestnet ? 0n : standardFeeBaseUnits;
  const waivedFeeBaseUnits = standardFeeBaseUnits - chargedFeeBaseUnits;
  return {
    paymentCount: invoiceAmountsBaseUnits.length,
    principalBaseUnits,
    feeBps: Number(SCHEDULE_FEE_BPS),
    feeCapBaseUnits: SCHEDULE_FEE_CAP_MUSD,
    standardFeeBaseUnits,
    chargedFeeBaseUnits,
    waivedFeeBaseUnits,
    totalSenderDebitBaseUnits: principalBaseUnits + chargedFeeBaseUnits,
    waivedOnTestnet,
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

