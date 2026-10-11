import { expect, test, type Page } from '@playwright/test';
import {
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  toHex,
  zeroHash,
} from 'viem';
import { paymentsAbi } from '../packages/mezo/src/index';

const founder = '0x1ac891Ce491851AC87851D62B9184c75A76f55cF';
const contractor = '0x99d7a7dcf20a0ac9fc3D03Cd90b0a1F4BC561b09';
const token = '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503';
const contract = '0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D';
const unit = 10n ** 18n;

async function fixture(page: Page, sentCount = 121, receivedCount = 22) {
  const controls = {
    failPage: false,
    failDetail: false,
    failRefresh: false,
    head: 256n,
    readBlocks: [] as string[],
    calls: [] as { name: string; offset: bigint; block: string }[],
  };
  const sent = Array.from({ length: sentCount }, (_, i) => BigInt(i + 1));
  const received = [
    1n,
    21n,
    ...Array.from({ length: 20 }, (_, i) => BigInt(201 + i)),
  ].slice(0, receivedCount);
  await page.addInitScript(
    ({ founder }) => {
      let account = founder;
      let connected = false;
      const listeners = new Map<string, Set<(...args: any[]) => void>>();
      const walletCalls: string[] = [];
      Object.assign(window, {
        scheduleWalletCalls: walletCalls,
        changeScheduleAccount(next: string) {
          account = next;
          listeners.get('accountsChanged')?.forEach((fn) => fn([next]));
        },
        ethereum: {
          isMetaMask: true,
          on(event: string, fn: (...args: any[]) => void) {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event)!.add(fn);
          },
          removeListener(event: string, fn: (...args: any[]) => void) {
            listeners.get(event)?.delete(fn);
          },
          async request({ method }: { method: string }) {
            walletCalls.push(method);
            if (method === 'eth_chainId') return '0x7b7b';
            if (method === 'eth_accounts') return connected ? [account] : [];
            if (method === 'eth_requestAccounts') {
              connected = true;
              return [account];
            }
            if (
              method === 'wallet_requestPermissions' ||
              method === 'wallet_revokePermissions'
            )
              return [];
            throw new Error(`Unexpected wallet request ${method}`);
          },
        },
      });
    },
    { founder },
  );
  await page.route('https://rpc.test.mezo.org/**', async (route) => {
    const respond = (request: any) => {
      const failure = () => ({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32000, message: 'Schedule RPC unavailable' },
      });
      let result: unknown;
      if (request.method === 'eth_chainId') result = '0x7b7b';
      else if (request.method === 'eth_getCode') result = '0x6000';
      else if (request.method === 'eth_getStorageAt') result = zeroHash;
      else if (request.method === 'eth_blockNumber')
        result = toHex(controls.head);
      else if (request.method === 'eth_getBalance') result = toHex(unit);
      else if (request.method === 'eth_getBlockByNumber')
        result = {
          number: toHex(controls.head),
          timestamp: toHex(BigInt(Math.floor(Date.now() / 1000))),
          transactions: [],
          gasLimit: '0x100',
          gasUsed: '0x0',
          difficulty: '0x0',
          extraData: '0x',
          size: '0x1',
          baseFeePerGas: '0x1',
        };
      else if (request.method === 'eth_call') {
        const target = request.params[0].to.toLowerCase();
        if (target !== token.toLowerCase() && target !== contract.toLowerCase())
          return failure();
        const abi = target === token.toLowerCase() ? erc20Abi : paymentsAbi;
        const decoded = decodeFunctionData({
          abi,
          data: request.params[0].data,
        });
        const name = decoded.functionName;
        const args = decoded.args as readonly any[];
        if (
          name === 'getSenderScheduleIds' ||
          name === 'getRecipientScheduleIds'
        ) {
          const offset = args[1] as bigint;
          expect(args[2]).toBe(20n);
          controls.calls.push({ name, offset, block: request.params[1] });
          if ((controls.failPage && offset >= 20n) || controls.failRefresh)
            return failure();
          const source =
            args[0].toLowerCase() !== founder.toLowerCase()
              ? [999n]
              : name === 'getSenderScheduleIds'
                ? sent
                : received;
          result = encodeFunctionResult({
            abi: paymentsAbi,
            functionName: name,
            result: source.slice(Number(offset), Number(offset + 20n)),
          });
        } else {
          if (name === 'getSchedule' || name === 'claimable')
            controls.readBlocks.push(request.params[1]);
          if (controls.failDetail && name === 'getSchedule' && args[0] === 22n)
            return failure();
          const id = args?.[0] as bigint;
          const values: Record<string, unknown> = {
            symbol: 'MUSD',
            decimals: 18,
            musd: token,
            balanceOf: 200n * unit,
            getSchedule: {
              sender: id < 200n ? founder : contractor,
              recipient: id === 1n ? founder : contractor,
              total: unit,
              start: 100n,
              end: 1000n,
              claimed: id === 2n ? unit / 10n : 0n,
              cancelled: id === 2n,
              vestedAtCancellation: id === 2n ? unit / 2n : 0n,
              referenceHash: zeroHash,
            },
            claimable: id === 2n ? (4n * unit) / 10n : unit,
          };
          result = encodeFunctionResult({
            abi,
            functionName: name,
            result: values[name],
          } as any);
        }
      } else throw new Error(`Unexpected RPC ${request.method}`);
      return { jsonrpc: '2.0', id: request.id, result };
    };
    const input = route.request().postDataJSON();
    await route.fulfill({
      json: Array.isArray(input) ? input.map(respond) : respond(input),
    });
  });
  return controls;
}

async function connect(page: Page) {
  await page
    .getByRole('button', { name: 'Connect wallet', exact: true })
    .click();
  await page.getByRole('button', { name: /MetaMask/ }).click();
}

test('loads beyond 100 schedules, deduplicates directions, and pins every page to one snapshot', async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto('/');
  await connect(page);
  const panel = page.getByRole('region', {
    name: 'Payment schedules',
    exact: true,
  });
  await expect(panel.locator('.schedule-card')).toHaveCount(39);
  await expect(panel.getByRole('status')).toContainText('Partial list');
  const metric = page
    .getByText('LOADED FUNDED OBLIGATIONS', { exact: true })
    .locator('..');
  await expect(metric).toContainText('20.4 MUSD'); // 21 sent IDs, including a cross-page self-payment.
  state.head = 257n; // Loading another page must not adopt this newer chain head.
  for (let i = 0; i < 6; i++) {
    await panel
      .getByRole('button', { name: 'Load more schedules', exact: true })
      .click();
    await expect(
      panel.getByRole('button', { name: /Loading more/ }),
    ).toHaveCount(0);
  }
  await expect(panel.locator('.schedule-card')).toHaveCount(141);
  await expect(panel.getByRole('status')).toContainText(
    'All sent and received schedules loaded',
  );
  await expect(
    panel.getByRole('link', { name: 'Schedule #121', exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole('button', { name: 'Load more schedules' }),
  ).toHaveCount(0);
  await expect(
    page.getByText('FUNDED OBLIGATIONS', { exact: true }).locator('..'),
  ).toContainText('120.4 MUSD');
  expect(
    state.calls
      .filter((c) => c.name === 'getSenderScheduleIds')
      .map((c) => c.offset),
  ).toEqual([0n, 20n, 40n, 60n, 80n, 100n, 120n]);
  expect(
    state.calls
      .filter((c) => c.name === 'getRecipientScheduleIds')
      .map((c) => c.offset),
  ).toEqual([0n, 20n]);
  expect(state.calls.every((c) => c.block === '0x100')).toBe(true);
  expect(state.readBlocks.every((block) => block === '0x100')).toBe(true);
  await panel.getByRole('button', { name: 'Refresh', exact: false }).click();
  await expect(panel.getByRole('status')).toContainText('Block 257');
  await expect(panel.locator('.schedule-card')).toHaveCount(141);
  expect(state.calls.filter((c) => c.block === '0x101').length).toBe(9);
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.locator('.schedule-pagination').scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: '.tools/schedules-mobile.png' });
  const walletCalls = await page.evaluate(
    () => (window as any).scheduleWalletCalls as string[],
  );
  expect(
    walletCalls.some(
      (method) => method.includes('sendTransaction') || method.includes('sign'),
    ),
  ).toBe(false);
});

for (const failure of ['ids', 'detail'] as const) {
  test(`retains previous pages and retries failed ${failure} reads without skipping schedules`, async ({
    page,
  }) => {
    const state = await fixture(page, 41, 0);
    await page.goto('/');
    await connect(page);
    const panel = page.getByRole('region', {
      name: 'Payment schedules',
      exact: true,
    });
    await expect(panel.locator('.schedule-card')).toHaveCount(20);
    state.failPage = failure === 'ids';
    state.failDetail = failure === 'detail';
    await panel
      .getByRole('button', { name: 'Load more schedules', exact: true })
      .click();
    await expect(panel.getByRole('alert')).toContainText(
      'Previously loaded schedules remain visible',
    );
    await expect(panel.locator('.schedule-card')).toHaveCount(20);
    await expect(panel.getByRole('status')).toContainText('Partial list');
    state.failPage = false;
    state.failDetail = false;
    await panel
      .getByRole('button', { name: 'Retry loading more schedules' })
      .click();
    await expect(panel.locator('.schedule-card')).toHaveCount(40);
    await panel
      .getByRole('button', { name: 'Load more schedules', exact: true })
      .click();
    await expect(panel.locator('.schedule-card')).toHaveCount(41);
    await expect(panel.getByRole('status')).toContainText(
      'All sent and received',
    );
  });
}

test('probes exact page boundaries, preserves refresh failures, and resets when accounts change', async ({
  page,
}) => {
  const state = await fixture(page, 20, 0);
  await page.goto('/');
  await connect(page);
  const panel = page.getByRole('region', {
    name: 'Payment schedules',
    exact: true,
  });
  await expect(panel.locator('.schedule-card')).toHaveCount(20);
  await expect(panel.getByRole('status')).toContainText('Partial list');
  await panel
    .getByRole('button', { name: 'Load more schedules', exact: true })
    .click();
  await expect(panel.getByRole('status')).toContainText(
    'All sent and received',
  );
  await expect(panel.locator('.schedule-card')).toHaveCount(20);
  state.failRefresh = true;
  await panel.getByRole('button', { name: /Refresh/ }).click();
  await expect(panel.getByRole('status')).toContainText('Refresh failed');
  await expect(panel.locator('.schedule-card')).toHaveCount(20);
  state.failRefresh = false;
  await page.evaluate(
    (contractor) => (window as any).changeScheduleAccount(contractor),
    contractor,
  );
  await expect(panel.locator('.schedule-card')).toHaveCount(1);
  await expect(
    panel.getByRole('link', { name: 'Schedule #999', exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole('link', { name: 'Schedule #1', exact: true }),
  ).toHaveCount(0);
  await expect(panel.getByRole('status')).toContainText(
    'All sent and received',
  );
  await expect(panel.getByRole('alert')).toHaveCount(0);
});

test('direct schedule links read arbitrary IDs without a wallet or discovery calls', async ({
  page,
}) => {
  const state = await fixture(page, 0, 0);
  await page.goto('/schedules/121');
  const panel = page.getByRole('region', {
    name: 'Payment schedules',
    exact: true,
  });
  await expect(
    panel.getByRole('link', { name: 'Schedule #121', exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole('status')).toContainText('Direct schedule view');
  await expect(
    panel.getByRole('button', { name: 'Load more schedules' }),
  ).toHaveCount(0);
  expect(state.calls).toEqual([]);
});

test('an empty account completes both discovery directions without load-more controls', async ({
  page,
}) => {
  await fixture(page, 0, 0);
  await page.goto('/');
  await connect(page);
  const panel = page.getByRole('region', {
    name: 'Payment schedules',
    exact: true,
  });
  await expect(panel.getByRole('status')).toContainText(
    '0 unique schedules loaded',
  );
  await expect(panel.getByRole('status')).toContainText(
    'All sent and received',
  );
  await expect(
    panel.getByRole('button', { name: 'Load more schedules' }),
  ).toHaveCount(0);
});
