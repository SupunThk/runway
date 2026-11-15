import { describe, expect, it } from 'vitest';
import {
  calculatePayrollRunFee,
  calculateScheduleFee,
  estimateWorkspaceRevenueEquivalent,
  RUNWAY_BUSINESS_MODEL,
  SCHEDULE_FEE_CAP_MUSD,
  scheduleFee,
  WORKSPACE_MONTHLY_FEE_MUSD,
} from './pricing';

const U = 10n ** 18n;

describe('Runway business model and fee calculator', () => {
  it('charges 25 bps on top of the schedule and leaves the recipient whole', () => {
    const quote = calculateScheduleFee(2_000n * U);
    expect(quote.feeBps).toBe(25);
    expect(quote.feeBaseUnits).toBe(5n * U);
    expect(quote.recipientReceivesBaseUnits).toBe(2_000n * U);
    expect(quote.totalSenderDebitBaseUnits).toBe(2_005n * U);
  });

  it('applies the 25 MUSD per-schedule cap and floors like the contract', () => {
    expect(scheduleFee(50_000n * U)).toBe(SCHEDULE_FEE_CAP_MUSD);
    expect(scheduleFee(1n)).toBe(0n);
    expect(scheduleFee(399n)).toBe(0n);
    expect(scheduleFee(400n)).toBe(1n);
  });

  it('uses the on-chain configuration when provided, including a zero fee', () => {
    expect(scheduleFee(1_000n * U, { feeBps: 0n, feeCapBaseUnits: 0n })).toBe(
      0n,
    );
    expect(
      scheduleFee(1_000n * U, { feeBps: 100n, feeCapBaseUnits: 100n * U }),
    ).toBe(10n * U);
    expect(() =>
      scheduleFee(1n, { feeBps: 101n, feeCapBaseUnits: 1n }),
    ).toThrow();
  });

  it('charges payroll runs only for scheduled payments, capped per payment', () => {
    const run = calculatePayrollRunFee([
      { amountBaseUnits: 2_000n * U, scheduled: true },
      { amountBaseUnits: 20_000n * U, scheduled: true },
      { amountBaseUnits: 1_000n * U, scheduled: false },
    ]);
    expect(run.paymentCount).toBe(3);
    expect(run.scheduledCount).toBe(2);
    expect(run.principalBaseUnits).toBe(23_000n * U);
    // 2,000 -> 5 MUSD; 20,000 -> capped 25 MUSD; one-time -> free.
    expect(run.feeBaseUnits).toBe(30n * U);
    expect(run.totalSenderDebitBaseUnits).toBe(23_030n * U);
  });

  it('estimates workspace subscription and volume fee equivalents', () => {
    const estimate = estimateWorkspaceRevenueEquivalent({
      workspaces: 3,
      fundedBaseUnits: 10_000n * U,
    });
    expect(estimate.workspaceMonthlyFeeBaseUnits).toBe(
      WORKSPACE_MONTHLY_FEE_MUSD.toString(),
    );
    expect(estimate.monthlySubscriptionEquivalentBaseUnits).toBe(
      (3n * 49n * U).toString(),
    );
    expect(estimate.volumeFeeEquivalentBaseUnits).toBe((25n * U).toString());
    expect(RUNWAY_BUSINESS_MODEL.scheduleFee.feeBps).toBe(25);
    expect(RUNWAY_BUSINESS_MODEL.scheduleFee.collection).toBe('on-chain');
  });
});
