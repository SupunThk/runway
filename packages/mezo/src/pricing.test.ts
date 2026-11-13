import { describe, expect, it } from 'vitest';
import {
  calculatePayrollRunFee,
  calculateScheduleFee,
  estimateWorkspaceRevenueEquivalent,
  RUNWAY_BUSINESS_MODEL,
  SCHEDULE_FEE_CAP_MUSD,
  WORKSPACE_MONTHLY_FEE_MUSD,
} from './pricing';

const U = 10n ** 18n;

describe('Runway business model and fee calculator', () => {
  it('keeps direct Solo tier schedules and transfers at 0 bps', () => {
    const quote = calculateScheduleFee(1_000n * U, {
      tier: 'solo',
      waiveOnTestnet: false,
    });
    expect(quote.feeBps).toBe(0);
    expect(quote.standardFeeBaseUnits).toBe(0n);
    expect(quote.chargedFeeBaseUnits).toBe(0n);
    expect(quote.recipientReceivesBaseUnits).toBe(1_000n * U);
    expect(quote.totalSenderDebitBaseUnits).toBe(1_000n * U);
  });

  it('calculates 25 bps Team tier fee and applies the 25 MUSD per-payment cap', () => {
    const standard = calculateScheduleFee(2_000n * U, {
      tier: 'team',
      waiveOnTestnet: false,
    });
    expect(standard.feeBps).toBe(25);
    expect(standard.standardFeeBaseUnits).toBe(5n * U);
    expect(standard.chargedFeeBaseUnits).toBe(5n * U);
    expect(standard.waivedFeeBaseUnits).toBe(0n);
    expect(standard.recipientReceivesBaseUnits).toBe(2_000n * U);
    expect(standard.totalSenderDebitBaseUnits).toBe(2_005n * U);

    const capped = calculateScheduleFee(50_000n * U, {
      tier: 'team',
      waiveOnTestnet: false,
    });
    expect(capped.standardFeeBaseUnits).toBe(SCHEDULE_FEE_CAP_MUSD);
    expect(capped.chargedFeeBaseUnits).toBe(25n * U);
    expect(capped.totalSenderDebitBaseUnits).toBe(50_025n * U);
  });

  it('waives the 25 bps fee on Mezo Testnet while reporting the exact waived equivalent', () => {
    const testnetQuote = calculateScheduleFee(4_000n * U, {
      tier: 'team',
      waiveOnTestnet: true,
    });
    expect(testnetQuote.standardFeeBaseUnits).toBe(10n * U);
    expect(testnetQuote.chargedFeeBaseUnits).toBe(0n);
    expect(testnetQuote.waivedFeeBaseUnits).toBe(10n * U);
    expect(testnetQuote.totalSenderDebitBaseUnits).toBe(4_000n * U);
  });

  it('aggregates per-invoice capped fees across a batch payroll run', () => {
    const runQuote = calculatePayrollRunFee([2_000n * U, 20_000n * U], {
      waiveOnTestnet: true,
    });
    expect(runQuote.paymentCount).toBe(2);
    expect(runQuote.principalBaseUnits).toBe(22_000n * U);
    // 2,000 MUSD -> 5 MUSD; 20,000 MUSD -> capped at 25 MUSD => total 30 MUSD
    expect(runQuote.standardFeeBaseUnits).toBe(30n * U);
    expect(runQuote.chargedFeeBaseUnits).toBe(0n);
    expect(runQuote.waivedFeeBaseUnits).toBe(30n * U);
    expect(runQuote.totalSenderDebitBaseUnits).toBe(22_000n * U);
  });

  it('estimates workspace subscription and volume fee equivalents without fabricating collected revenue', () => {
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
    expect(RUNWAY_BUSINESS_MODEL.teamTier.scheduleFeeBps).toBe(25);
  });
});
