import { expect, test } from '@playwright/test';
import {
  decodeFunctionData,
  encodeFunctionData,
  encodeFunctionResult,
  erc20Abi,
  encodeEventTopics,
  encodeAbiParameters,
  toHex,
} from 'viem';
import { paymentsAbi } from '../packages/mezo/src/index';

const contract = '0x01A1662F2EB6C15Bfb2c8fd010c53c9055478b7D';
const sender = '0x1ac891Ce491851AC87851D62B9184c75A76f55cF';
const token = '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503';
const hash = `0x${'1'.repeat(64)}`;
const key = `runway:pending:v1:31611:${contract.toLowerCase()}`;

for (const scenario of [
  'pending',
  'success',
  'reverted',
  'approval',
  'funding',
  'cancellation',
  'rpc-error',
  'replacement',
  'foreign-deployment',
  'corrupt',
  'claim-submitted',
  'approval-submitted',
] as const) {
  test(`recovers ${scenario} transaction after reload without signing`, async ({
    page,
  }) => {
    const submitted = scenario.endsWith('-submitted');
    const action = scenario.startsWith('approval')
      ? 'Approval'
      : scenario === 'funding'
        ? 'Funding'
        : scenario === 'cancellation'
          ? 'Cancellation'
          : 'Claim';
    const data =
      action === 'Funding'
        ? encodeFunctionData({
            abi: paymentsAbi,
            functionName: 'createSchedule',
            args: [sender, 1n, 100n, 1000n, toHex(0n, { size: 32 })],
          })
        : action === 'Cancellation'
          ? encodeFunctionData({
              abi: paymentsAbi,
              functionName: 'cancel',
              args: [2n],
            })
          : action === 'Approval'
            ? encodeFunctionData({
                abi: erc20Abi,
                functionName: 'approve',
                args: [contract, submitted ? 1000000000000000000n : 1n],
              })
            : encodeFunctionData({
                abi: paymentsAbi,
                functionName: 'claim',
                args: [2n],
              });
    const record = {
      version: 1,
      chainId: 31611,
      contract,
      sender,
      target: action === 'Approval' ? token : contract,
      hash,
      data,
      action,
      scheduleId: '2',
      submittedAt: '2026-10-11T03:00:00.000Z',
    };
    await page.addInitScript(
      ({ key, record, scenario }) => {
        if (
          !scenario.endsWith('-submitted') &&
          !sessionStorage.getItem('recovery-seeded')
        ) {
          localStorage.setItem(
            scenario === 'foreign-deployment' ? key.replace('31611', '1') : key,
            scenario === 'corrupt' ? '{invalid' : JSON.stringify(record),
          );
          sessionStorage.setItem('recovery-seeded', 'yes');
        }
      },
      { key, record, scenario },
    );
    if (submitted)
      await page.addInitScript(
        ({ sender, hash }) => {
          const calls: string[] = [];
          Object.assign(window, {
            recoveryWalletCalls: calls,
            ethereum: {
              isMetaMask: true,
              on() {},
              removeListener() {},
              async request({ method }: { method: string }) {
                calls.push(method);
                if (method === 'eth_chainId') return '0x7b7b';
                if (
                  method === 'eth_accounts' ||
                  method === 'eth_requestAccounts'
                )
                  return [sender];
                if (method === 'wallet_requestPermissions') return [];
                if (method === 'eth_sendTransaction') return hash;
                throw new Error(`Unexpected wallet method: ${method}`);
              },
            },
          });
        },
        { sender, hash },
      );
    let resolved =
      !submitted && scenario !== 'pending' && scenario !== 'rpc-error';
    await page.route('https://rpc.test.mezo.org/**', async (route) => {
      const respond = (request: any) => {
        let result: unknown;
        const error = (code: number, message: string) => ({
          jsonrpc: '2.0',
          id: request.id,
          error: { code, message },
        });
        if (request.method === 'eth_chainId') result = '0x7b7b';
        else if (request.method === 'eth_blockNumber') result = '0x100';
        else if (request.method === 'eth_getBalance') result = '0x100';
        else if (request.method === 'eth_getStorageAt')
          result = toHex(0n, { size: 32 });
        else if (request.method === 'eth_getCode') result = '0x6000';
        else if (request.method === 'eth_getTransactionReceipt') {
          if (!resolved && scenario === 'rpc-error')
            return error(-32000, 'RPC unavailable');
          if (!resolved) result = null;
          else
            result = {
              transactionHash: hash,
              transactionIndex: '0x0',
              blockHash: toHex(256n, { size: 32 }),
              blockNumber: '0x100',
              from: sender,
              to: record.target,
              cumulativeGasUsed: '0x100',
              gasUsed: '0x100',
              effectiveGasPrice: '0x1',
              logs:
                action === 'Funding'
                  ? [
                      {
                        address: contract,
                        topics: encodeEventTopics({
                          abi: paymentsAbi,
                          eventName: 'ScheduleCreated',
                          args: { scheduleId: 3n, sender, recipient: sender },
                        }),
                        data: encodeAbiParameters(
                          [
                            { type: 'uint256' },
                            { type: 'uint64' },
                            { type: 'uint64' },
                            { type: 'bytes32' },
                          ],
                          [1n, 100n, 1000n, toHex(0n, { size: 32 })],
                        ),
                        transactionHash: hash,
                        transactionIndex: '0x0',
                        blockHash: toHex(256n, { size: 32 }),
                        blockNumber: '0x100',
                        logIndex: '0x0',
                        removed: false,
                      },
                    ]
                  : [],
              logsBloom: `0x${'0'.repeat(512)}`,
              status: scenario === 'reverted' ? '0x0' : '0x1',
              type: '0x2',
              contractAddress: null,
            };
        } else if (request.method === 'eth_getTransactionByHash')
          result = {
            hash,
            from: sender,
            to: record.target,
            input: scenario === 'replacement' ? '0x' : data,
            value: '0x0',
            nonce: '0x1',
            blockNumber: '0x100',
            blockHash: toHex(256n, { size: 32 }),
            transactionIndex: '0x0',
            gas: '0x100',
            gasPrice: '0x1',
            type: '0x0',
            v: '0x1',
            r: '0x1',
            s: '0x1',
          };
        else if (request.method === 'eth_getBlockByNumber')
          result = {
            number: '0x100',
            timestamp: '0x1000',
            transactions: [],
            gasLimit: '0x100',
            gasUsed: '0x0',
            difficulty: '0x0',
            extraData: '0x',
            size: '0x1',
            baseFeePerGas: '0x1',
          };
        else if (request.method === 'eth_call') {
          if (
            ![contract.toLowerCase(), token.toLowerCase()].includes(
              request.params[0].to.toLowerCase(),
            )
          )
            return error(
              -32000,
              'Borrowing reads unavailable in payment fixture',
            );
          const abi =
            request.params[0].to.toLowerCase() === token.toLowerCase()
              ? erc20Abi
              : paymentsAbi;
          const { functionName } = decodeFunctionData({
            abi,
            data: request.params[0].data,
          });
          const values: Record<string, unknown> = {
            balanceOf: 2000000000000000000n,
            allowance: 0n,
            claim: undefined,
            approve: true,
            getSenderScheduleIds: [],
            getRecipientScheduleIds: [],
            symbol: 'MUSD',
            decimals: 18,
            musd: token,
            getSchedule: {
              sender,
              recipient: sender,
              total: 100n,
              start: 100n,
              end: 1000n,
              claimed: 0n,
              cancelled: false,
              vestedAtCancellation: 0n,
              referenceHash: toHex(0n, { size: 32 }),
            },
            claimable: 100n,
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
    await page.goto(
      scenario === 'approval-submitted' ? '/?create=1' : '/schedules/2',
    );
    if (submitted) {
      const connect = page.getByRole('button', { name: 'Connect wallet' });
      if (await connect.count()) {
        await connect.click();
        await page
          .getByRole('group', { name: 'Choose wallet' })
          .getByRole('button', { name: 'MetaMask', exact: true })
          .click();
      }
      if (scenario === 'approval-submitted') {
        await page.getByLabel('Recipient wallet').fill(sender);
        await page.getByLabel('Total funding').fill('1');
        await expect(
          page.getByRole('button', { name: 'Approve & fund schedule' }),
        ).toBeEnabled();
        await page
          .getByRole('button', { name: 'Approve & fund schedule' })
          .click();
      } else {
        await expect(
          page.getByRole('button', { name: 'Claim to recipient' }),
        ).toBeEnabled();
        await page.getByRole('button', { name: 'Claim to recipient' }).click();
      }
      await expect
        .poll(() => page.evaluate((key) => localStorage.getItem(key), key))
        .not.toBeNull();
      const saved = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!),
        key,
      );
      expect(saved.hash).toBe(hash);
      expect(saved.action).toBe(action);
      expect(saved.data).toBe(data);
      expect(
        await page.evaluate(
          () =>
            (window as any).recoveryWalletCalls.filter(
              (method: string) => method === 'eth_sendTransaction',
            ).length,
        ),
      ).toBe(1);
      await page.reload();
    }
    const panel = page.getByRole('region', { name: 'Saved transaction' });
    if (scenario === 'foreign-deployment') {
      await expect(panel).toHaveCount(0);
      return;
    }
    if (scenario === 'corrupt') {
      await expect(page.getByRole('alert')).toContainText(
        'Saved transaction data is damaged',
      );
      await expect(
        page.getByRole('button', { name: 'Claim to recipient' }),
      ).toBeDisabled();
      page.once('dialog', (dialog) => dialog.accept());
      await page
        .getByRole('button', { name: 'Remove unreadable tracking' })
        .click();
      await expect(page.getByRole('alert')).toHaveCount(0);
      return;
    }
    const expected =
      scenario === 'pending' || submitted
        ? 'No receipt found yet'
        : scenario === 'rpc-error'
          ? 'Could not check confirmation'
          : scenario === 'reverted'
            ? 'Transaction reverted'
            : scenario === 'replacement'
              ? 'differs from the saved action'
              : scenario === 'approval'
                ? 'No schedule was funded by this approval'
                : `${action} confirmed.`;
    await expect(panel).toContainText(expected);
    await expect(
      panel.getByRole('link', { name: 'View saved transaction' }),
    ).toHaveAttribute('href', `https://explorer.test.mezo.org/tx/${hash}`);
    await page.reload();
    await expect(panel).toContainText(expected);
    if (submitted)
      expect(
        await page.evaluate(
          () =>
            (window as any).recoveryWalletCalls.filter(
              (method: string) => method === 'eth_sendTransaction',
            ).length,
        ),
      ).toBe(0);
    if (scenario === 'funding')
      await expect(
        panel.getByRole('link', { name: 'Open funded schedule #3' }),
      ).toHaveAttribute('href', '/schedules/3');
    if (!resolved) {
      await expect(
        panel.getByRole('button', { name: 'Acknowledge & refresh' }),
      ).toHaveCount(0);
      resolved = true;
      await panel
        .getByRole('button', { name: 'Check transaction status' })
        .click();
      await expect(panel).toContainText(
        action === 'Approval' ? 'Approval confirmed.' : 'Claim confirmed.',
      );
    }
    await panel.getByRole('button', { name: 'Acknowledge & refresh' }).click();
    await expect(panel).toHaveCount(0);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), key),
    ).toBeNull();
  });
}
