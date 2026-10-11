import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeEventTopics,
  encodeAbiParameters,
  erc20Abi,
  toHex,
} from 'viem';
import { paymentsAbi } from '../packages/mezo/src/index';

for (const id of [1, 2]) {
  test(`schedule ${id} history reconciles with saved onchain evidence`, async ({
    page,
  }) => {
    const fixture = JSON.parse(
      await readFile(`deployments/schedule-${id}.check.json`, 'utf8'),
    );
    const logs = fixture.events.map((event: any, index: number) => {
      const abi = paymentsAbi.find(
        (item) => item.type === 'event' && item.name === event.event,
      ) as any;
      const args = Object.fromEntries(
        Object.entries(event.args).map(([key, value]) => [
          key,
          typeof value === 'string' && /^\d+$/.test(value)
            ? BigInt(value)
            : value,
        ]),
      );
      const fields = abi.inputs.filter((field: any) => !field.indexed);
      return {
        address: fixture.contract,
        topics: encodeEventTopics({
          abi: paymentsAbi,
          eventName: event.event,
          args,
        } as any),
        data: encodeAbiParameters(
          fields,
          fields.map((field: any) => args[field.name]),
        ),
        blockNumber: toHex(BigInt(event.blockNumber)),
        blockHash: toHex(BigInt(event.blockNumber), { size: 32 }),
        transactionHash: event.transactionHash,
        transactionIndex: '0x0',
        logIndex: toHex(index),
        removed: false,
      };
    });
    let fail = true;
    const ranges: [bigint, bigint][] = [];
    await page.route('https://rpc.test.mezo.org/**', async (route) => {
      const respond = (request: any) => {
        let result: unknown;
        if (request.method === 'eth_chainId') result = '0x7b7b';
        else if (request.method === 'eth_getCode') result = '0x6000';
        else if (request.method === 'eth_blockNumber')
          result = toHex(BigInt(fixture.block) + 10000n);
        else if (request.method === 'eth_getLogs') {
          if (fail)
            return {
              jsonrpc: '2.0',
              id: request.id,
              error: {
                code: -32000,
                message: 'History temporarily unavailable',
              },
            };
          const { fromBlock, toBlock, address, topics } = request.params[0];
          expect(address.toLowerCase()).toBe(fixture.contract.toLowerCase());
          expect(topics[1]).toBe(toHex(BigInt(id), { size: 32 }));
          ranges.push([BigInt(fromBlock), BigInt(toBlock)]);
          const matching = logs.filter(
            (log: any) =>
              log.topics[0] === topics[0] &&
              BigInt(log.blockNumber) >= BigInt(fromBlock) &&
              BigInt(log.blockNumber) <= BigInt(toBlock),
          );
          result = [...matching].reverse().concat(matching.slice(0, 1));
        } else if (request.method.startsWith('eth_getBlockBy'))
          result = {
            number: toHex(BigInt(fixture.block)),
            timestamp: toHex(BigInt(fixture.schedule.start)),
            hash: request.params[0],
            transactions: [],
            gasLimit: '0x100',
            gasUsed: '0x0',
            difficulty: '0x0',
            extraData: '0x',
            size: '0x1',
            baseFeePerGas: '0x1',
          };
        else if (request.method === 'eth_call') {
          const abi =
            request.params[0].to.toLowerCase() ===
            '0x118917a40faf1cd7a13db0ef56c86de7973ac503'
              ? erc20Abi
              : paymentsAbi;
          const { functionName } = decodeFunctionData({
            abi,
            data: request.params[0].data,
          });
          const schedule = Object.fromEntries(
            Object.entries(fixture.schedule).map(([key, value]) => [
              key,
              typeof value === 'string' && /^\d+$/.test(value)
                ? BigInt(value)
                : value,
            ]),
          );
          const values: Record<string, unknown> = {
            symbol: 'MUSD',
            decimals: 18,
            musd: '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503',
            getSchedule: schedule,
            claimable: 0n,
          };
          result = encodeFunctionResult({
            abi,
            functionName,
            result: values[functionName],
          } as any);
        } else throw new Error(`Unexpected RPC ${request.method}`);
        return { jsonrpc: '2.0', id: request.id, result };
      };
      const input = route.request().postDataJSON();
      await route.fulfill({
        json: Array.isArray(input) ? input.map(respond) : respond(input),
      });
    });
    await page.goto(`/schedules/${id}`);
    await page
      .getByRole('button', { name: 'Transaction history & receipts' })
      .click();
    const history = page.getByRole('region', {
      name: `Transaction history for schedule ${id}`,
    });
    await expect(history.getByRole('alert')).toBeVisible({ timeout: 15000 });
    fail = false;
    await history.getByRole('button', { name: 'Retry history' }).click();
    await expect(history.getByText(/Partial history/)).toBeVisible();
    const rows = history.locator('li');
    await expect(rows).toHaveCount(fixture.events.length);
    for (const [index, event] of fixture.events.entries()) {
      await expect(
        rows.nth(index).getByRole('link', { name: 'View transaction' }),
      ).toHaveAttribute(
        'href',
        `https://explorer.test.mezo.org/tx/${event.transactionHash}`,
      );
    }
    if (id === 2) {
      await expect(rows.nth(2)).toContainText('0.371666666666666667 MUSD');
      await expect(rows.nth(1)).toContainText('0.533333333333333333 MUSD');
      await expect(rows.nth(3)).toContainText('0.095 MUSD');
    }
    const downloaded = page.waitForEvent('download');
    await rows
      .first()
      .getByRole('button', { name: 'Download event receipt' })
      .click();
    const download = await downloaded;
    const receipt = JSON.parse(
      await readFile((await download.path())!, 'utf8'),
    );
    expect(receipt.amount).toBe(fixture.schedule.total);
    expect(receipt.scheduleId).toBe(String(id));
    expect(receipt.transactionHash).toBe(fixture.events[0].transactionHash);
    fail = true;
    await history.getByRole('button', { name: 'Load next blocks' }).click();
    await expect(history.getByRole('alert')).toBeVisible();
    await expect(rows).toHaveCount(fixture.events.length);
    fail = false;
    await history.getByRole('button', { name: 'Retry history' }).click();
    await expect(history.getByText(/History scanned:/)).toBeVisible();
    expect(ranges[0][0]).toBe(16083735n);
    for (const [from, to] of ranges)
      expect(to - from).toBeLessThanOrEqual(999n);
    const uniqueRanges = [
      ...new Map(ranges.map((range) => [range[0].toString(), range])).values(),
    ];
    for (let i = 1; i < uniqueRanges.length; i++)
      expect(uniqueRanges[i][0]).toBe(uniqueRanges[i - 1][1] + 1n);
    await expect(rows).toHaveCount(fixture.events.length);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
