import { describe, expect, it } from 'vitest';
import { freeCash, optionalAddress, vestedAmount } from './index';

describe('integer schedule accounting', () => {
  it('handles boundaries and final rounding dust', () => {
    expect(vestedAmount(101n, 10n, 110n, 0n)).toBe(0n);
    expect(vestedAmount(101n, 10n, 110n, 10n)).toBe(0n);
    expect(vestedAmount(101n, 10n, 110n, 60n)).toBe(50n);
    expect(vestedAmount(101n, 10n, 110n, 110n)).toBe(101n);
    expect(vestedAmount(101n, 10n, 110n, 111n)).toBe(101n);
  });
  it('keeps amounts larger than JS safe integers exact', () => {
    expect(vestedAmount(10n ** 30n, 0n, 100n, 33n)).toBe(33n * 10n ** 28n);
  });
  it('rejects malformed schedules and clamps reserves', () => {
    expect(() => vestedAmount(100n, 10n, 10n, 20n)).toThrow();
    expect(() => vestedAmount(-1n, 0n, 10n, 5n)).toThrow();
    expect(freeCash(100n, 150n)).toBe(0n);
    expect(freeCash(100n, 30n)).toBe(70n);
    expect(() => freeCash(-1n, 0n)).toThrow();
  });
  it('does not accept invalid or zero configuration addresses', () => {
    expect(optionalAddress('')).toBeUndefined();
    expect(
      optionalAddress('0x0000000000000000000000000000000000000000'),
    ).toBeUndefined();
    expect(optionalAddress('not-an-address')).toBeUndefined();
  });
});
