import { describe, expect, it } from 'vitest';
import {
  quoteHeadroom,
  quoteLoan,
  RATIO_SCALE as U,
  type LoanInput,
  type LoanState,
} from '../src/borrowing-quotes';

const state: LoanState = {
  active: true,
  collateral: U,
  debt: 2_000n * U,
  price: 10_000n * U,
  systemCollateral: 100n * U,
  systemDebt: 100_000n * U,
  minimumRatio: (11n * U) / 10n,
  criticalRatio: (15n * U) / 10n,
  minNetDebt: 1_800n * U,
  gasReserve: 200n * U,
  feeRate: U / 1_000n,
  feeExempt: false,
  maxBorrowingCapacity: 6_000n * U,
};
const input: LoanInput = {
  operation: 'borrow',
  amount: 100n * U,
  collateralAdded: 0n,
  targetRatio: 2n * U,
};
describe('verified borrowing quote accounting', () => {
  it('adds issuance fee to debt, not wallet proceeds; adds no second reserve', () => {
    const q = quoteLoan(state, input);
    expect(q.eligible).toBe(true);
    expect(q.proceeds).toBe(100n * U);
    expect(q.fee).toBe(U / 10n);
    expect(q.debt).toBe(2100n * U + U / 10n);
    expect(q.reserveAdded).toBe(0n);
  });
  it('opening checks net debt including fee, and adds reserve exactly once', () => {
    const s = { ...state, active: false, collateral: 0n, debt: 0n };
    const q = quoteLoan(s, {
      ...input,
      operation: 'open',
      collateralAdded: U,
      amount: 1800n * U,
    });
    expect(q.eligible).toBe(true);
    expect(q.debt).toBe(2000n * U + (18n * U) / 10n);
    expect(
      quoteLoan(s, {
        ...input,
        operation: 'open',
        collateralAdded: U,
        amount: 1n * U,
      }).eligible,
    ).toBe(false);
  });
  it('does not silently increase a small loan to meet minimum debt', () => {
    const q = quoteLoan(
      { ...state, active: false, collateral: 0n, debt: 0n },
      { ...input, operation: 'open', collateralAdded: U, amount: U },
    );
    expect(q.proceeds).toBe(U);
    expect(q.reasons.join(' ')).toContain('minimum');
  });
  it('pure collateral addition changes no debt, fee or reserve', () => {
    const q = quoteLoan(state, {
      ...input,
      operation: 'add-collateral',
      collateralAdded: U / 10n,
      amount: 0n,
    });
    expect(q.eligible).toBe(true);
    expect(q.debt).toBe(state.debt);
    expect(q.collateral).toBe((11n * U) / 10n);
    expect(q.fee + q.proceeds + q.reserveAdded).toBe(0n);
  });
  it('retains stored capacity even when collateral is added', () => {
    const q = quoteLoan(
      { ...state, maxBorrowingCapacity: state.debt + 50n * U },
      { ...input, collateralAdded: U },
    );
    expect(q.eligible).toBe(false);
    expect(q.reasons.join(' ')).toContain('stored borrowing-capacity');
  });
  it('rejects a system TCR violation despite a healthy individual trove', () => {
    const s = { ...state, systemCollateral: 3n * U, systemDebt: 20_000n * U };
    const q = quoteLoan(s, input);
    expect(q.recovery).toBe(false);
    expect(q.ratio!).toBeGreaterThan(2n * U);
    expect(q.eligible).toBe(false);
  });
  it('Recovery Mode waives the fee, and a debt increase must preserve ICR', () => {
    const s = { ...state, systemCollateral: 3n * U, systemDebt: 25_000n * U };
    const bad = quoteLoan(s, input);
    expect(bad.recovery).toBe(true);
    expect(bad.fee).toBe(0n);
    expect(bad.eligible).toBe(false);
    const good = quoteLoan(s, { ...input, collateralAdded: U / 10n });
    expect(good.eligible).toBe(true);
  });
  it('Recovery opening uses CCR and never applies the issuance fee', () => {
    const s = {
      ...state,
      active: false,
      debt: 0n,
      collateral: 0n,
      systemCollateral: 3n * U,
      systemDebt: 25_000n * U,
    };
    const q = quoteLoan(s, {
      ...input,
      operation: 'open',
      amount: 1800n * U,
      collateralAdded: (3n * U) / 10n,
      targetRatio: (15n * U) / 10n,
    });
    expect(q.ratio).toBe((15n * U) / 10n);
    expect(q.eligible).toBe(true);
    expect(q.fee).toBe(0n);
    expect(
      quoteLoan(s, {
        ...input,
        operation: 'open',
        amount: 1800n * U,
        collateralAdded: (3n * U) / 10n - 1n,
        targetRatio: (15n * U) / 10n,
      }).eligible,
    ).toBe(false);
  });
  it('partial repayment preserves minimum net debt at the exact boundary', () => {
    const s = { ...state, debt: 2100n * U };
    const q = quoteLoan(s, { ...input, operation: 'repay' });
    expect(q.eligible).toBe(true);
    expect(q.debt).toBe(2000n * U);
    expect(q.fee).toBe(0n);
    expect(
      quoteLoan(s, { ...input, operation: 'repay', amount: 100n * U + 1n })
        .eligible,
    ).toBe(false);
    expect(
      quoteLoan(s, { ...input, operation: 'repay', amount: 3_000n * U })
        .eligible,
    ).toBe(false);
  });
  it('respects borrower-specific fee exemption and integer fee rounding', () => {
    expect(quoteLoan({ ...state, feeExempt: true }, input).fee).toBe(0n);
    expect(quoteLoan(state, { ...input, amount: 999n }).fee).toBe(0n);
    expect(quoteLoan(state, { ...input, amount: 1_000n }).fee).toBe(1n);
  });
  it('headroom returns spendable proceeds; one base unit more violates a bound', () => {
    const q = quoteHeadroom(state, 0n, 2n * U);
    expect(q.proceeds).toBeGreaterThan(0n);
    expect(q.proceeds).toBeLessThan(3_000n * U);
    expect(quoteLoan(state, { ...input, amount: q.proceeds }).eligible).toBe(
      true,
    );
    expect(
      quoteLoan(state, { ...input, amount: q.proceeds + 1n }).eligible,
    ).toBe(false);
  });
  it('opening headroom is zero if no amount can meet the minimum', () => {
    const s = { ...state, active: false, collateral: 0n, debt: 0n };
    expect(quoteHeadroom(s, U / 100n, 2n * U).proceeds).toBe(0n);
    const q = quoteHeadroom(s, U, 2n * U);
    expect(q.proceeds).toBeGreaterThan(1800n * U);
    expect(
      quoteLoan(s, {
        ...input,
        operation: 'open',
        collateralAdded: U,
        amount: q.proceeds,
      }).eligible,
    ).toBe(true);
  });
  it('Recovery headroom without added collateral is zero', () => {
    expect(
      quoteHeadroom(
        { ...state, systemCollateral: 3n * U, systemDebt: 25_000n * U },
        0n,
        2n * U,
      ).proceeds,
    ).toBe(0n);
  });
  it('rejects inconsistent input and does not mutate snapshots', () => {
    expect(() => quoteLoan({ ...state, price: 0n }, input)).toThrow();
    expect(() => quoteLoan(state, { ...input, amount: -1n })).toThrow();
    expect(() => quoteLoan({ ...state, active: false }, input)).toThrow();
    expect(quoteLoan(state, { ...input, operation: 'open' }).eligible).toBe(
      false,
    );
    expect(state.debt).toBe(2000n * U);
  });
});
