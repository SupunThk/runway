import { describe, expect, it } from 'vitest';
import { borrowingStress } from '../src/stress';

const unit = 10n ** 18n;
const calculate = (drop: number) =>
  borrowingStress(unit, 2000n * unit, (11n * unit) / 10n, 4000n * unit, drop);
describe('borrowing price stress', () => {
  it('preserves the source ratio and total debt at zero drop', () => {
    expect(calculate(0)).toMatchObject({
      price: 4000n * unit,
      ratio: 2n * unit,
      thresholdPrice: 2200n * unit,
      belowThreshold: false,
    });
    expect(calculate(20)).toMatchObject({
      price: 3200n * unit,
      ratio: (16n * unit) / 10n,
    });
  });
  it('distinguishes above, equal and below the threshold', () => {
    expect(calculate(44)).toMatchObject({
      belowThreshold: false,
      atThreshold: false,
    });
    expect(calculate(45)).toMatchObject({
      belowThreshold: false,
      atThreshold: true,
    });
    expect(calculate(46)).toMatchObject({
      belowThreshold: true,
      atThreshold: false,
    });
    expect(calculate(100)).toMatchObject({
      price: 0n,
      ratio: 0n,
      belowThreshold: true,
    });
  });
  it('rounds the threshold upward and classifies before ratio truncation', () => {
    const result = borrowingStress(3n * unit, unit + 1n, unit, unit / 3n, 0);
    expect(result.thresholdPrice).toBe((unit + 3n) / 3n);
    expect(result.belowThreshold).toBe(true);
    expect(
      borrowingStress(3n * unit, unit + 1n, unit, result.thresholdPrice, 0)
        .belowThreshold,
    ).toBe(false);
  });
  it('rejects invalid snapshots and non-whole or out-of-range drops', () => {
    for (const drop of [-1, 101, 1.5, NaN, Infinity])
      expect(() => calculate(drop)).toThrow();
    for (const values of [
      [0n, unit, unit, unit],
      [unit, 0n, unit, unit],
      [unit, unit, -1n, unit],
      [unit, unit, unit, 0n],
    ]) {
      expect(() =>
        borrowingStress(values[0], values[1], values[2], values[3], 20),
      ).toThrow();
    }
  });
});
