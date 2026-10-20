import { describe, expect, it } from 'vitest';
import {
  activeSchedules,
  paymentRatePerSecond,
  fundedThrough,
  payrollCoveredUntil,
  borrowingHeadroom,
  requiredForMonths,
  monthsCovered,
  MONTH_SECONDS,
  type PlannerSchedule,
} from '../src/planner';
const schedule = (changes: Partial<PlannerSchedule> = {}): PlannerSchedule => ({
  sender: '0xAbC',
  total: 100n,
  claimed: 0n,
  start: 0n,
  end: 100n,
  cancelled: false,
  ...changes,
});
const unit = 10n ** 18n;
const headroom = (
  changes: Partial<Parameters<typeof borrowingHeadroom>[0]> = {},
) =>
  borrowingHeadroom({
    collateral: unit,
    debt: 1000n * unit,
    price: 4000n * unit,
    dropPercent: 20,
    targetRatio: 2n * unit,
    minimumRatio: (11n * unit) / 10n,
    ...changes,
  });
describe('runway planner', () => {
  it('filters by owner, cancellation, time and valid duration', () => {
    const current = schedule();
    expect(
      activeSchedules(
        [
          current,
          schedule({ cancelled: true }),
          schedule({ sender: 'other' }),
          schedule({ start: 51n }),
          schedule({ end: 50n }),
          schedule({ end: 0n }),
          schedule({ total: 0n }),
        ],
        '0xabc',
        50n,
      ),
    ).toEqual([current]);
    expect(activeSchedules([current], '0xABC', 0n)).toEqual([current]);
    expect(activeSchedules([current], '0xabc', 100n)).toEqual([]);
  });
  it('adds mixed-duration rates with conservative ceiling rounding', () => {
    expect(
      paymentRatePerSecond([
        schedule({ total: 101n }),
        schedule({ total: 1n, end: 200n }),
      ]),
    ).toBe(3n);
    expect(paymentRatePerSecond([])).toBe(0n);
    expect(() => paymentRatePerSecond([schedule({ end: 0n })])).toThrow();
  });
  it('finds the earliest funded end', () => {
    expect(fundedThrough([])).toBeUndefined();
    expect(fundedThrough([schedule()])).toBe(100n);
    expect(fundedThrough([schedule({ end: 200n }), schedule()])).toBe(100n);
  });
  it('spends wallet only as individual streams require renewal', () => {
    const rows = [schedule(), schedule({ end: 200n, total: 200n })];
    expect(payrollCoveredUntil(rows, 0n)).toBe(100n);
    expect(payrollCoveredUntil(rows, 50n)).toBe(150n);
    expect(payrollCoveredUntil(rows, 100n)).toBe(200n);
    expect(payrollCoveredUntil(rows, 150n)).toBe(225n);
    expect(payrollCoveredUntil([...rows].reverse(), 150n)).toBe(225n);
  });
  it('groups simultaneous ends and floors the final partial second', () => {
    expect(payrollCoveredUntil([schedule(), schedule()], 5n)).toBe(102n);
    expect(payrollCoveredUntil([], 0n)).toBeUndefined();
    expect(() => payrollCoveredUntil([], -1n)).toThrow();
  });
  it('calculates conservative borrowing capacity and exact boundaries', () => {
    expect(headroom().headroom).toBe(600n * unit);
    expect(headroom({ debt: 1600n * unit }).headroom).toBe(0n);
    expect(headroom({ debt: 1601n * unit }).headroom).toBe(0n);
    expect(headroom({ dropPercent: 100 })).toEqual({
      stressedPrice: 0n,
      maxDebt: 0n,
      headroom: 0n,
    });
    expect(headroom({ debt: 0n }).headroom).toBe(1600n * unit);
    expect(headroom({ collateral: 0n }).headroom).toBe(0n);
  });
  it('rejects invalid snapshots, targets and drop values', () => {
    for (const dropPercent of [-1, 101, 0.5, NaN, Infinity])
      expect(() => headroom({ dropPercent })).toThrow();
    for (const changes of [
      { collateral: -1n },
      { debt: -1n },
      { price: 0n },
      { minimumRatio: 0n },
      { targetRatio: unit },
      { targetRatio: (11n * unit) / 10n },
    ])
      expect(() => headroom(changes)).toThrow();
  });
  it('validates planning months and handles zero-rate projections', () => {
    expect(requiredForMonths(2n, 3)).toBe(6n * MONTH_SECONDS);
    expect(requiredForMonths(0n, 24)).toBe(0n);
    expect(monthsCovered(7n * MONTH_SECONDS, 2n)).toBe(3n);
    expect(monthsCovered(1n, 0n)).toBeUndefined();
    for (const months of [0, 25, 1.2, NaN, Infinity])
      expect(() => requiredForMonths(0n, months)).toThrow();
    expect(() => requiredForMonths(-1n, 1)).toThrow();
    expect(() => monthsCovered(-1n, 1n)).toThrow();
    expect(() => monthsCovered(1n, -1n)).toThrow();
  });
});
