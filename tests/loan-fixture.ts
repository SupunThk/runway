import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { Page } from '@playwright/test';
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  erc20Abi,
  toHex,
  zeroAddress,
  type Abi,
  type Hash,
} from 'viem';
import {
  borrowerOperationsAbi,
  borrowingAbi,
  borrowingDeployment as base,
  borrowingSystemAbi,
  borrowingWriteDeployment as deps,
  governableVariablesAbi,
  hintHelpersAbi,
  interestManagerAbi,
  MEZO_TESTNET_TOKEN,
  paymentsAbi,
  priceFeedAbi,
  priceOracleAbi,
  sortedTrovesAbi,
} from '../packages/mezo/src/index';

const data = JSON.parse(
  readFileSync('tests/fixtures/mezo-borrowing-runtime.json', 'utf8'),
);
const runtime: Record<string, string> = JSON.parse(
  gunzipSync(Buffer.from(data.runtime, 'base64')).toString(),
);
const paymentRuntime = JSON.parse(
  readFileSync('tests/fixtures/runway-payments-runtime.json', 'utf8'),
);
const paymentContract = paymentRuntime.address as `0x${string}`;
runtime[paymentContract.toLowerCase()] = paymentRuntime.runtime;
export const loanOwner = '0x0000000000000000000000000000000000000011';
export const loanHash = `0x${'a1'.repeat(32)}` as Hash;
const blockHash = `0x${'11'.repeat(32)}`;
export async function installLoanFixture(
  page: Page,
  options: {
    inactive?: boolean;
    recovery?: boolean;
    changedCode?: boolean;
    stale?: boolean;
    pending?: boolean;
    reject?: boolean;
    lowGas?: boolean;
    rejectFunding?: boolean;
    proof?: boolean;
    failProofRow?: boolean;
    revertedTransfer?: boolean;
  } = {},
) {
  const U = 10n ** 18n;
  let fee = U / 1000n;
  const transactions = new Map<string, Record<string, string>>();
  let walletMusd = 1000n * U,
    allowance = 0n;
  let loanDebt = options.inactive ? 0n : 2100n * U,
    loanCollateral = options.inactive ? 0n : U;
  let active = !options.inactive;
  let created:
    | {
        recipient: `0x${string}`;
        total: bigint;
        start: bigint;
        end: bigint;
        referenceHash: Hash;
      }
    | undefined;
  let submissions = 0;
  let finalized = !options.pending;
  const now =
    BigInt(Math.floor(Date.now() / 1000)) - (options.stale ? 130n : 0n);
  await page.exposeFunction(
    'recordLoanSubmission',
    (tx: Record<string, string>) => {
      submissions++;
      const hash =
        submissions === 1 ? loanHash : toHex(BigInt(submissions), { size: 32 });
      transactions.set(hash, tx);
      if (tx.to.toLowerCase() === deps.operations.address.toLowerCase()) {
        const decoded = decodeFunctionData({
          abi: borrowerOperationsAbi,
          data: tx.data as `0x${string}`,
        });
        if (
          decoded.functionName === 'withdrawMUSD' ||
          decoded.functionName === 'openTrove'
        ) {
          walletMusd += decoded.args[0];
          loanDebt +=
            decoded.args[0] +
            (options.recovery ? 0n : (decoded.args[0] * fee) / U) +
            (decoded.functionName === 'openTrove' ? 200n * U : 0n);
          active = true;
        }
        if (decoded.functionName === 'adjustTrove' && decoded.args[2]) {
          walletMusd += decoded.args[1];
          loanDebt +=
            decoded.args[1] +
            (options.recovery ? 0n : (decoded.args[1] * fee) / U);
        }
        if (decoded.functionName === 'repayMUSD') {
          walletMusd -= decoded.args[0];
          loanDebt -= decoded.args[0];
        }
        loanCollateral += BigInt(tx.value ?? '0x0');
      } else if (tx.to.toLowerCase() === base.musd.toLowerCase()) {
        const decoded = decodeFunctionData({
          abi: erc20Abi,
          data: tx.data as `0x${string}`,
        });
        if (decoded.functionName === 'approve') allowance = decoded.args[1];
        if (decoded.functionName === 'transfer' && !options.revertedTransfer)
          walletMusd -= decoded.args[1];
      } else if (tx.to.toLowerCase() === paymentContract.toLowerCase()) {
        const decoded = decodeFunctionData({
          abi: paymentsAbi,
          data: tx.data as `0x${string}`,
        });
        if (decoded.functionName === 'createSchedule') {
          created = {
            recipient: decoded.args[0],
            total: decoded.args[1],
            start: decoded.args[2],
            end: decoded.args[3],
            referenceHash: decoded.args[4],
          };
          walletMusd -= created.total;
        }
      }
      return hash;
    },
  );
  await page.addInitScript(
    ({ owner, reject, rejectFunding, paymentContract }) => {
      let connected = sessionStorage.getItem('loan-test-connected') === '1';
      const provider = {
        on() {},
        removeListener() {},
        async request({
          method,
          params,
        }: {
          method: string;
          params?: unknown[];
        }) {
          if (method === 'eth_chainId')
            return (
              (window as unknown as { loanWalletChain?: string })
                .loanWalletChain ?? '0x7b7b'
            );
          if (method === 'eth_accounts') return connected ? [owner] : [];
          if (method === 'wallet_requestPermissions') return [];
          if (method === 'eth_requestAccounts') {
            connected = true;
            sessionStorage.setItem('loan-test-connected', '1');
            return [owner];
          }
          if (method === 'eth_sendTransaction') {
            if (
              reject ||
              (rejectFunding &&
                (params?.[0] as { to?: string })?.to?.toLowerCase() ===
                  paymentContract.toLowerCase())
            )
              throw Object.assign(new Error('User rejected request.'), {
                code: 4001,
              });
            return (
              window as unknown as {
                recordLoanSubmission: (tx: unknown) => Promise<string>;
              }
            ).recordLoanSubmission(params![0]);
          }
          throw new Error(`Unexpected wallet call ${method}`);
        },
      };
      Object.assign(window, { ethereum: provider });
    },
    {
      owner: loanOwner,
      reject: options.reject ?? false,
      rejectFunding: options.rejectFunding ?? false,
      paymentContract,
    },
  );
  const abis: Abi[] = [
    borrowerOperationsAbi,
    borrowingSystemAbi,
    hintHelpersAbi,
    sortedTrovesAbi,
    interestManagerAbi,
    governableVariablesAbi,
    priceFeedAbi,
    priceOracleAbi,
    borrowingAbi,
    paymentsAbi,
    erc20Abi,
  ];
  await page.route('https://rpc.test.mezo.org/**', async (route) => {
    const respond = (r: { id: number; method: string; params: any[] }) => {
      let result: unknown;
      const address = r.params?.[0]?.to?.toLowerCase();
      const transaction = transactions.get(r.params?.[0]);
      let transfer: readonly [`0x${string}`, bigint] | undefined;
      if (transaction?.to.toLowerCase() === base.musd.toLowerCase()) {
        try {
          const decoded = decodeFunctionData({
            abi: erc20Abi,
            data: transaction.data as `0x${string}`,
          });
          if (decoded.functionName === 'transfer') transfer = decoded.args;
        } catch {
          /* Approval has no transfer event. */
        }
      }
      if (r.method === 'eth_chainId') result = '0x7b7b';
      else if (r.method === 'eth_blockNumber')
        result = toHex(finalized ? 123456n : 123445n);
      else if (r.method === 'eth_getBalance')
        result = toHex(options.lowGas ? 0n : 2n * U);
      else if (r.method === 'eth_gasPrice') result = toHex(10n);
      else if (r.method === 'eth_estimateGas') result = toHex(200_000n);
      else if (r.method === 'eth_getCode')
        result = runtime[r.params[0].toLowerCase()]
          ? options.changedCode
            ? '0x6000'
            : runtime[r.params[0].toLowerCase()]
          : '0x6000';
      else if (r.method === 'eth_getStorageAt') {
        const dep = Object.values(deps).find(
          (d) => d.address.toLowerCase() === r.params[0].toLowerCase(),
        );
        const impl =
          dep?.implementation ??
          (r.params[0].toLowerCase() === base.manager.toLowerCase()
            ? base.managerImplementation
            : base.priceImplementation);
        result = `0x${'0'.repeat(24)}${impl.slice(2)}`;
      } else if (r.method === 'eth_getBlockByNumber')
        result = {
          number: toHex(123456n),
          timestamp: toHex(now),
          hash: blockHash,
          parentHash: blockHash,
          transactions: [],
          gasLimit: '0x1000000',
          gasUsed: '0x0',
          baseFeePerGas: '0x1',
          nonce: '0x0000000000000000',
          difficulty: '0x0',
          extraData: '0x',
          miner: zeroAddress,
        };
      else if (r.method === 'eth_getTransactionReceipt')
        result = transaction
          ? {
              transactionHash: r.params[0],
              blockNumber: toHex(123440n),
              blockHash,
              from: loanOwner,
              to: transaction.to,
              transactionIndex: '0x0',
              gasUsed: '0x100',
              cumulativeGasUsed: '0x100',
              effectiveGasPrice: '0xa',
              logs:
                transaction.to.toLowerCase() ===
                  paymentContract.toLowerCase() && created
                  ? [
                      {
                        address: paymentContract,
                        topics: encodeEventTopics({
                          abi: paymentsAbi,
                          eventName: 'ScheduleCreated',
                          args: {
                            scheduleId: 1n,
                            sender: loanOwner,
                            recipient: created.recipient,
                          },
                        }),
                        data: encodeAbiParameters(
                          [
                            { type: 'uint256' },
                            { type: 'uint64' },
                            { type: 'uint64' },
                            { type: 'bytes32' },
                          ],
                          [
                            created.total,
                            created.start,
                            created.end,
                            created.referenceHash,
                          ],
                        ),
                        blockNumber: toHex(123440n),
                        blockHash,
                        transactionHash: r.params[0],
                        transactionIndex: '0x0',
                        logIndex: '0x0',
                        removed: false,
                      },
                    ]
                  : transfer
                    ? [
                        {
                          address: base.musd,
                          topics: encodeEventTopics({
                            abi: erc20Abi,
                            eventName: 'Transfer',
                            args: { from: loanOwner, to: transfer[0] },
                          }),
                          data: encodeAbiParameters(
                            [{ type: 'uint256' }],
                            [transfer[1]],
                          ),
                          blockNumber: toHex(123440n),
                          blockHash,
                          transactionHash: r.params[0],
                          transactionIndex: '0x0',
                          logIndex: '0x0',
                          removed: false,
                        },
                      ]
                    : [],
              logsBloom: `0x${'00'.repeat(256)}`,
              status: options.revertedTransfer && transfer ? '0x0' : '0x1',
              type: '0x0',
              contractAddress: null,
            }
          : null;
      else if (r.method === 'eth_getTransactionByHash')
        result = transaction
          ? {
              hash: r.params[0],
              blockNumber: toHex(123440n),
              blockHash,
              transactionIndex: '0x0',
              from: loanOwner,
              to: transaction.to,
              input: transaction.data,
              value: transaction.value ?? '0x0',
              gas: '0x100000',
              gasPrice: '0xa',
              nonce: '0x0',
              type: '0x0',
              v: '0x1b',
              r: toHex(1n, { size: 32 }),
              s: toHex(1n, { size: 32 }),
            }
          : null;
      else if (r.method === 'eth_call') {
        if (
          address === deps.operations.address.toLowerCase() &&
          r.params[0].data &&
          ['0x', '0x0'].includes(r.params[1]) === false
        ) {
          try {
            const decoded = decodeFunctionData({
              abi: borrowerOperationsAbi,
              data: r.params[0].data,
            });
            if (
              [
                'openTrove',
                'withdrawMUSD',
                'repayMUSD',
                'adjustTrove',
                'addColl',
              ].includes(decoded.functionName)
            )
              return { jsonrpc: '2.0', id: r.id, result: '0x' };
          } catch {
            /* Continue read dispatch. */
          }
        }
        let found = false;
        for (const abi of abis) {
          let decoded;
          try {
            decoded = decodeFunctionData({ abi, data: r.params[0].data });
          } catch {
            continue;
          }
          const f = decoded.functionName;
          if (['approve', 'transfer'].includes(f))
            return {
              jsonrpc: '2.0',
              id: r.id,
              result: encodeFunctionResult({
                abi: erc20Abi,
                functionName: f as 'approve' | 'transfer',
                result: true,
              }),
            };
          if (f === 'createSchedule')
            return {
              jsonrpc: '2.0',
              id: r.id,
              result: encodeFunctionResult({
                abi: paymentsAbi,
                functionName: 'createSchedule',
                result: 1n,
              }),
            };
          if (
            f === 'getSchedule' &&
            options.failProofRow &&
            decoded.args?.[0] === 2n
          )
            return {
              jsonrpc: '2.0',
              id: r.id,
              error: { code: -32000, message: 'Fixture row unavailable' },
            };
          const price = 10_000n * U;
          const systemDebt = options.recovery ? 800_000n * U : 100_000n * U;
          const values: Record<string, unknown> = {
            musd: base.musd,
            musdToken: base.musd,
            troveManager: base.manager,
            priceFeed: base.priceFeed,
            sortedTroves: deps.sorted.address,
            interestRateManager: deps.interest.address,
            governableVariables: deps.governance.address,
            borrowerOperations: deps.operations.address,
            borrowerOperationsAddress: deps.operations.address,
            oracle: base.oracle,
            fetchPrice: price,
            latestRoundData: [1n, price, now, now, 0n],
            decimals: 18,
            getTroveStatus: active ? 1 : 0,
            getEntireDebtAndColl: !active
              ? [0n, 0n, 0n, 0n, 0n, 0n]
              : [loanCollateral, loanDebt, 0n, 0n, 0n, 0n],
            getTroveMaxBorrowingCapacity: 6_000n * U,
            getTroveInterestRate: 100,
            interestRate: 100,
            getAccruedInterest: 0n,
            getEntireSystemDebt: systemDebt,
            getEntireSystemColl: 100n * U,
            MCR: (11n * U) / 10n,
            CCR: (15n * U) / 10n,
            minNetDebt: 1800n * U,
            MUSD_GAS_COMPENSATION: 200n * U,
            borrowingRate: fee,
            isAccountFeeExempt: false,
            getTCR: (100n * U * price) / systemDebt,
            checkRecoveryMode: options.recovery ?? false,
            getCurrentICR: loanDebt ? (loanCollateral * price) / loanDebt : 0n,
            getApproxHint: [zeroAddress, 0n, 1n],
            findInsertPosition: [zeroAddress, zeroAddress],
            symbol:
              r.params[0].to.toLowerCase() === MEZO_TESTNET_TOKEN.toLowerCase()
                ? 'MEZO'
                : 'MUSD',
            balanceOf: walletMusd,
            outstandingObligations: 90n * U,
            scheduleCount: 2n,
            getSenderScheduleIds: options.proof
              ? [1n, 2n]
              : created
                ? [1n]
                : [],
            getRecipientScheduleIds: [],
            getSchedule: options.proof
              ? {
                  sender: loanOwner,
                  recipient: '0x0000000000000000000000000000000000000022',
                  total: 100n * U,
                  start: now - 100n,
                  end: now + 1000n,
                  claimed: 25n * U,
                  cancelled: decoded.args?.[0] === 2n,
                  vestedAtCancellation: 40n * U,
                  referenceHash: `0x${'00'.repeat(32)}`,
                }
              : created
                ? {
                    sender: loanOwner,
                    ...created,
                    claimed: 0n,
                    cancelled: false,
                    vestedAtCancellation: 0n,
                  }
                : undefined,
            claimable: 0n,
            allowance,
          };
          if (!(f in values)) continue;
          result = encodeFunctionResult({
            abi,
            functionName: f,
            result: values[f] as never,
          });
          found = true;
          break;
        }
        if (!found)
          throw new Error(`Unhandled fixture eth_call ${r.params[0].data}`);
      } else throw new Error(`Unexpected fixture RPC ${r.method}`);
      return { jsonrpc: '2.0', id: r.id, result };
    };
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: Array.isArray(body) ? body.map(respond) : respond(body),
    });
  });
  return {
    setFee: (value: bigint) => {
      fee = value;
    },
    finish: () => {
      finalized = true;
    },
    submissions: () => submissions,
  };
}
