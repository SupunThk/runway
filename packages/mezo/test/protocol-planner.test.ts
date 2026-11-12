import { describe, expect, it } from 'vitest';
import {
  protocolBorrowingScenario,
  quoteLoan,
  type LoanState,
} from '../src/index';
const U = 10n ** 18n;
const state: LoanState = {
  active: true,
  collateral: U,
  debt: 2100n * U,
  price: 10000n * U,
  systemCollateral: 100n * U,
  systemDebt: 100000n * U,
  minimumRatio: (11n * U) / 10n,
  criticalRatio: (15n * U) / 10n,
  minNetDebt: 1800n * U,
  gasReserve: 200n * U,
  feeRate: U / 1000n,
  feeExempt: false,
  maxBorrowingCapacity: 6000n * U,
};
describe('protocol-aware borrowing planning', () => {
  it('matches executable quote arithmetic and never adds the opening reserve twice', () => {
    const result = protocolBorrowingScenario(state, 0, 2n * U, 0n, 1000n * U);
    const quote = quoteLoan(state, {
      operation: 'borrow',
      amount: 1000n * U,
      collateralAdded: 0n,
      targetRatio: 2n * U,
    });
    expect(result.quote).toEqual(quote);
    expect(result.quote?.debtIncrease).toBe(1001n * U);
    expect(result.quote?.reserveAdded).toBe(0n);
    expect(result.proceeds).toBeLessThan(2900n * U);
  });
  it('recalculates system mode under stress and enforces stored limits after a collateral top-up', () => {
    const stressed = protocolBorrowingScenario(state, 90, 2n * U);
    expect(stressed.recovery).toBe(true);
    expect(stressed.proceeds).toBe(0n);
    const added = protocolBorrowingScenario(state, 0, 2n * U, 10n * U);
    const quoted = quoteLoan(state, {
      operation: 'borrow',
      amount: added.proceeds,
      collateralAdded: 10n * U,
      targetRatio: 2n * U,
    });
    expect(quoted.eligible).toBe(true);
    expect(quoted.debt).toBeLessThanOrEqual(state.maxBorrowingCapacity);
    expect(state.price).toBe(10000n * U);
  });
  it('does not advertise a small opening that cannot satisfy minimum net debt', () => {
    const result = protocolBorrowingScenario(
      { ...state, active: false, collateral: 0n, debt: 0n },
      0,
      2n * U,
      U / 10n,
      10n * U,
    );
    expect(result.proceeds).toBe(0n);
    expect(result.reasons.join(' ')).toContain('minimum');
    expect(result.quote?.eligible).toBe(false);
    expect(protocolBorrowingScenario(state, 100, 2n * U).proceeds).toBe(0n);
  });
});
