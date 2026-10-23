import { describe, expect, it } from 'vitest';
import { paymentDurationMinutes } from './paymentOptions';

describe('payment periods', () => {
  it.each([
    ['30', 'minutes', 30],
    ['2', 'hours', 120],
    ['30', 'days', 43200],
    ['365', 'days', 525600],
    ['8760', 'hours', 525600],
  ])('converts %s %s to chain minutes', (amount, unit, expected) => {
    expect(paymentDurationMinutes(amount as string, unit as string)).toBe(
      expected,
    );
  });

  it.each([
    ['0', 'days'],
    ['-1', 'hours'],
    ['1.5', 'days'],
    ['366', 'days'],
    ['8761', 'hours'],
    ['525601', 'minutes'],
    ['', 'minutes'],
    ['Infinity', 'days'],
    ['1', 'months'],
    ['1', '__proto__'],
  ])('rejects invalid period %s %s before signing', (amount, unit) => {
    expect(() => paymentDurationMinutes(amount, unit)).toThrow();
  });
});
