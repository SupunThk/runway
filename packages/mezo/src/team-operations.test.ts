import { describe, expect, it } from 'vitest';
import {
  cashForecast,
  csvCell,
  nextOccurrence,
  validUtcDate,
} from './team-operations';
describe('team cash planning and recurrence', () => {
  it('preserves the original month day across short and leap months', () => {
    const plan = {
      nextDueDate: '2028-01-31',
      cadence: 'monthly' as const,
      interval: 1,
      anchorDay: 31,
    };
    expect(nextOccurrence(plan)).toBe('2028-02-29');
    expect(nextOccurrence({ ...plan, nextDueDate: '2028-02-29' })).toBe(
      '2028-03-31',
    );
    expect(
      nextOccurrence({ ...plan, cadence: 'weekly', nextDueDate: '2026-12-28' }),
    ).toBe('2027-01-04');
  });
  it('rejects invalid dates and unsupported recurrence ranges', () => {
    expect(validUtcDate('2026-02-30')).toBe(false);
    expect(() =>
      nextOccurrence({
        nextDueDate: '2199-12-31',
        cadence: 'monthly',
        interval: 1,
        anchorDay: 31,
      }),
    ).toThrow();
  });
  it('subtracts the reserve once, includes overdue obligations, and keeps revenue assumptions explicit', () => {
    const input = {
      start: '2026-11-04',
      days: 3,
      walletBaseUnits: '100',
      reserveBaseUnits: '20',
      includeExpected: false,
      incomplete: true,
      entries: [
        {
          id: 'overdue',
          date: '2026-11-01',
          amountBaseUnits: '30',
          direction: 'out' as const,
          assumed: false,
          label: 'Overdue invoice',
        },
        {
          id: 'revenue',
          date: '2026-11-05',
          amountBaseUnits: '100',
          direction: 'in' as const,
          assumed: true,
          label: 'Expected revenue',
        },
        {
          id: 'payroll',
          date: '2026-11-06',
          amountBaseUnits: '60',
          direction: 'out' as const,
          assumed: false,
          label: 'Payroll',
        },
      ],
    };
    expect(cashForecast(input)).toMatchObject({
      endingBaseUnits: '-10',
      minimumBaseUnits: '-10',
      firstShortfall: '2026-11-06',
      incomplete: true,
    });
    expect(cashForecast({ ...input, includeExpected: true })).toMatchObject({
      endingBaseUnits: '90',
      minimumBaseUnits: '50',
      firstShortfall: null,
    });
    expect(() =>
      cashForecast({ ...input, entries: [input.entries[0], input.entries[0]] }),
    ).toThrow('Duplicate');
  });
  it('uses exact integers and does not include flows outside the selected horizon', () => {
    expect(
      cashForecast({
        start: '2026-11-04',
        days: 1,
        walletBaseUnits: '1000000000000000001',
        reserveBaseUnits: '0',
        includeExpected: true,
        incomplete: false,
        entries: [
          {
            id: 'later',
            label: 'Later',
            date: '2026-11-05',
            amountBaseUnits: '1',
            assumed: false,
            direction: 'out',
          },
        ],
      }).endingBaseUnits,
    ).toBe('1000000000000000001');
  });
  it('neutralizes spreadsheet formulas while preserving quotes and newlines', () => {
    expect(csvCell(' =HYPERLINK("x")')).toBe('"\' =HYPERLINK(""x"")"');
    expect(csvCell('normal\n"note"')).toBe('"normal\n""note"""');
  });
});
