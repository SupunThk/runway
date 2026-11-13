import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import { receivedCsv, recipientSummary } from './components/RecipientEarnings';
import { setupSteps } from './components/GettingStarted';
import { overviewCsv } from './Admin';
import type { AdminOverview } from './adminTypes';

const me = '0x00000000000000000000000000000000000000aa' as Address;
const other = '0x00000000000000000000000000000000000000bb' as Address;
const U = 10n ** 18n;
const row = (over: Record<string, unknown>) =>
  ({
    id: 1n,
    sender: other,
    recipient: me,
    total: 100n * U,
    start: 1_800_000_000n,
    end: 1_800_086_400n,
    claimed: 0n,
    cancelled: false,
    vestedAtCancellation: 0n,
    referenceHash: `0x${'0'.repeat(64)}`,
    claimable: 0n,
    chainTime: 1_800_000_100n,
    ...over,
  }) as never;

describe('recipient earnings', () => {
  it('totals only received schedules and caps cancelled ones at their vested amount', () => {
    const summary = recipientSummary(
      [
        row({ id: 1n, claimed: 10n * U, claimable: 20n * U }),
        row({
          id: 2n,
          cancelled: true,
          vestedAtCancellation: 40n * U,
          claimed: 15n * U,
          claimable: 25n * U,
        }),
        row({ id: 3n, recipient: other, sender: me, claimable: 50n * U }),
        row({ id: 4n, claimed: 100n * U }),
      ],
      me,
    );
    expect(summary.rows.map((r: { id: bigint }) => r.id)).toEqual([1n, 2n, 4n]);
    expect(summary.entitled).toBe(240n * U);
    expect(summary.claimed).toBe(125n * U);
    expect(summary.claimable).toBe(45n * U);
    expect(summary.vesting).toBe(70n * U);
    expect(summary.claimableIds).toEqual([1n, 2n]);
  });
  it('matches the recipient case-insensitively and exports a CSV row per schedule', () => {
    const rows = [row({ recipient: me.toUpperCase().replace('0X', '0x') })];
    expect(recipientSummary(rows, me).rows).toHaveLength(1);
    const csv = receivedCsv(rows, 18).split('\n');
    expect(csv[0]).toContain('schedule_id');
    expect(csv[1]).toMatch(/^1,0x0+bb,100,0,0,2027-/);
    expect(csv[1].endsWith(',active')).toBe(true);
  });
});

describe('getting started checklist', () => {
  it('derives each step from live wallet state', () => {
    expect(
      setupSteps({ hasSchedule: false }).filter((s) => s.done),
    ).toHaveLength(0);
    const steps = setupSteps({
      address: me,
      chainId: 31611,
      btc: 1n,
      musd: 0n,
      hasSchedule: false,
    });
    expect(steps.map((s) => s.done)).toEqual([true, true, true, false, false]);
    expect(
      setupSteps({
        address: me,
        chainId: 1,
        btc: 1n,
        musd: 1n,
        hasSchedule: true,
      })[1].done,
    ).toBe(false);
  });
});

describe('admin CSV export', () => {
  it('flattens the snapshot and neutralises spreadsheet formulas', () => {
    const csv = overviewCsv({
      generatedAt: '2026-11-13T00:00:00.000Z',
      usage: { workspaces: 2, daily: [{ date: '2026-11-12', wallets: 1 }] },
      alerts: [{ code: 'x', message: '=HYPERLINK("evil")' }],
    } as unknown as AdminOverview);
    expect(csv.split('\n')[0]).toBe('metric,value');
    expect(csv).toContain('usage.workspaces,2');
    expect(csv).toContain('usage.daily.2026-11-12.wallets,1');
    expect(csv).toContain(`alerts.x.message,"'=HYPERLINK(""evil"")"`);
  });
});
