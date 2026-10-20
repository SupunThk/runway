import { expect, type Page } from '@playwright/test';
import {
  decodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  toHex,
  zeroHash,
} from 'viem';
import {
  borrowingAbi,
  borrowingDeployment as deployment,
  MEZO_TESTNET_TOKEN,
  paymentsAbi,
  priceFeedAbi,
  priceOracleAbi,
} from '../packages/mezo/src/index';

export const plannerAccount = '0x0000000000000000000000000000000000000011';
export const unit = 10n ** 18n;
export async function installPlannerFixture(
  page: Page,
  options: {
    symbol?: string;
    mezoFailure?: boolean;
    emptyCode?: boolean;
    empty?: boolean;
    future?: boolean;
    partial?: boolean;
    staleLoan?: boolean;
    stalePayments?: boolean;
    paymentFailure?: boolean;
    invalidDeployment?: boolean;
    minimumRatio?: bigint;
    inactiveLoan?: boolean;
    unequal?: boolean;
  } = {},
) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const block = 123456n;
  const reads: { target: string; functionName: string; block: string }[] = [];
  await page.addInitScript(
    ({ account }) => {
      let connected = false;
      const listeners = new Map<string, ((arg: unknown) => void)[]>();
      Object.assign(window, {
        ethereum: {
          on(event: string, fn: (arg: unknown) => void) {
            listeners.set(event, [...(listeners.get(event) ?? []), fn]);
          },
          removeListener() {},
          async request({ method }: { method: string }) {
            if (method === 'eth_chainId') return '0x7b7b';
            if (method === 'eth_accounts') return connected ? [account] : [];
            if (method === 'wallet_requestPermissions') return [];
            if (method === 'eth_requestAccounts') {
              connected = true;
              return [account];
            }
            throw new Error(`Unexpected wallet request: ${method}`);
          },
        },
      });
    },
    { account: plannerAccount },
  );
  await page.route('https://rpc.test.mezo.org/**', async (route) => {
    const respond = (request: {
      id: number;
      method: string;
      params: any[];
    }) => {
      let result: unknown;
      const failure = () => ({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32000, message: 'Fixture RPC unavailable' },
      });
      if (request.method === 'eth_chainId') result = '0x7b7b';
      else if (request.method === 'eth_blockNumber') result = toHex(block);
      else if (request.method === 'eth_getBalance') {
        expect(request.params[1]).toBe(toHex(block));
        result = toHex(unit);
      } else if (request.method === 'eth_getCode')
        result =
          options.emptyCode &&
          request.params[0].toLowerCase() === MEZO_TESTNET_TOKEN.toLowerCase()
            ? '0x'
            : '0x6000';
      else if (request.method === 'eth_getStorageAt') {
        const impl =
          request.params[0].toLowerCase() === deployment.manager.toLowerCase()
            ? deployment.managerImplementation
            : deployment.priceImplementation;
        result = `0x${'0'.repeat(24)}${impl.slice(2)}`;
      } else if (request.method === 'eth_getBlockByNumber')
        result = {
          number: toHex(block),
          timestamp: toHex(now - (options.stalePayments ? 130n : 0n)),
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
        const mezo = target === MEZO_TESTNET_TOKEN.toLowerCase();
        const abi =
          target === deployment.manager.toLowerCase()
            ? borrowingAbi
            : target === deployment.priceFeed.toLowerCase()
              ? priceFeedAbi
              : target === deployment.oracle.toLowerCase()
                ? priceOracleAbi
                : target === deployment.musd.toLowerCase() || mezo
                  ? erc20Abi
                  : paymentsAbi;
        const { functionName, args } = decodeFunctionData({
          abi,
          data: request.params[0].data,
        });
        reads.push({ target, functionName, block: request.params[1] });
        if (mezo && options.mezoFailure && functionName === 'balanceOf')
          return failure();
        const payment = [
          'getSenderScheduleIds',
          'getRecipientScheduleIds',
          'getSchedule',
          'claimable',
        ].includes(functionName);
        if (payment && options.paymentFailure) return failure();
        const time = now - (options.stalePayments ? 130n : 0n);
        const end = time + (args?.[0] === 2n && options.unequal ? 200n : 100n);
        const start = time - 100n;
        const ids = options.empty
          ? []
          : options.partial
            ? Array.from({ length: 20 }, (_, i) => BigInt(i + 1))
            : [1n, 2n];
        const values: Record<string, unknown> = {
          symbol: mezo ? (options.symbol ?? 'MEZO') : 'MUSD',
          decimals: 18,
          balanceOf: mezo ? 42n * unit : options.unequal ? 50n : 100n * unit,
          musd: options.invalidDeployment
            ? MEZO_TESTNET_TOKEN
            : deployment.musd,
          getSenderScheduleIds: ids,
          getRecipientScheduleIds: [],
          getSchedule: {
            sender: plannerAccount,
            recipient: '0x0000000000000000000000000000000000000022',
            total: options.unequal
              ? end - start
              : ((end - start) * unit) / 86400n,
            start: options.future ? time + 10n : start,
            end,
            claimed: 0n,
            cancelled: false,
            vestedAtCancellation: 0n,
            referenceHash: zeroHash,
          },
          claimable: 0n,
          musdToken: deployment.musd,
          priceFeed: deployment.priceFeed,
          oracle: deployment.oracle,
          getTroveStatus: options.inactiveLoan ? 0 : 1,
          getEntireDebtAndColl: [unit, 900n * unit, 100n * unit, 0n, 0n, 0n],
          getTroveInterestRate: 100,
          MCR: options.minimumRatio ?? 1100000000000000000n,
          MUSD_GAS_COMPENSATION: 200n * unit,
          latestRoundData: [
            1n,
            4000n * unit,
            now,
            now - (options.staleLoan ? 61n : 0n),
            0n,
          ],
          fetchPrice: 4000n * unit,
          getCurrentICR: 4n * unit,
        };
        result = encodeFunctionResult({
          abi,
          functionName,
          result: values[functionName],
        } as any);
      } else throw new Error(`Unexpected RPC: ${request.method}`);
      return { jsonrpc: '2.0', id: request.id, result };
    };
    const input = route.request().postDataJSON();
    await route.fulfill({
      json: Array.isArray(input) ? input.map(respond) : respond(input),
    });
  });
  return { now, block, reads };
}
export async function connectPlannerWallet(page: Page) {
  await page
    .getByRole('button', { name: 'Connect wallet', exact: true })
    .click();
  await page
    .getByRole('group', { name: 'Choose wallet' })
    .getByRole('button', { name: 'Browser wallet', exact: true })
    .click();
}
