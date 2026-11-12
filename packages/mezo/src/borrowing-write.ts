import {
  encodeFunctionData,
  erc20Abi,
  getContract,
  getAddress,
  keccak256,
  type Address,
  type PublicClient,
} from 'viem';
import {
  borrowingDeployment,
  implementationSlot,
  priceFeedAbi,
  priceOracleAbi,
  scaleOraclePrice,
} from './borrowing.ts';
import {
  collateralRatio,
  quoteLoan,
  type LoanInput,
  type LoanState,
} from './borrowing-quotes.ts';
import {
  borrowerOperationsAbi,
  borrowingSystemAbi,
  borrowingWriteDeployment as deployment,
  governableVariablesAbi,
  hintHelpersAbi,
  interestManagerAbi,
  sortedTrovesAbi,
} from './borrowing-write-config.ts';

export type LoanSnapshot = LoanState & {
  account: Address;
  blockNumber: bigint;
  blockHash: `0x${string}`;
  chainTime: bigint;
  oracleUpdatedAt: bigint;
  walletMusd: bigint;
  walletBtc: bigint;
  rate: number;
  openingRate: number;
};
export function assertLoanFresh(snapshot: LoanSnapshot, now = Date.now()) {
  const age = BigInt(Math.floor(now / 1000)) - snapshot.chainTime;
  if (age > 60n || age < -30n)
    throw new Error('Loan quote is stale. Refresh and review again.');
}
export async function readLoanSnapshot(
  client: PublicClient,
  account: Address,
  expectedMusd: Address,
): Promise<LoanSnapshot> {
  if (getAddress(expectedMusd) !== borrowingDeployment.musd)
    throw new Error('Unsupported borrowing token.');
  const [chainId, block] = await Promise.all([
    client.getChainId(),
    client.getBlock(),
  ]);
  if (chainId !== borrowingDeployment.chainId || !block.hash)
    throw new Error('Unsupported borrowing network or block.');
  const pinned = { blockNumber: block.number };
  await Promise.all([
    ...Object.values(deployment).map(
      async ({ address, implementation, codeHash }) => {
        const [code, slot, runtime] = await Promise.all([
          client.getCode({ address, ...pinned }),
          client.getStorageAt({ address, slot: implementationSlot, ...pinned }),
          client.getCode({ address: implementation, ...pinned }),
        ]);
        if (
          !code ||
          code === '0x' ||
          slot?.slice(-40).toLowerCase() !==
            implementation.slice(2).toLowerCase() ||
          !runtime ||
          keccak256(runtime) !== codeHash
        )
          throw new Error(
            'Borrowing contract identity changed. Writes require reverification.',
          );
      },
    ),
    ...[
      [borrowingDeployment.manager, borrowingDeployment.managerImplementation],
      [borrowingDeployment.priceFeed, borrowingDeployment.priceImplementation],
    ].map(async ([address, implementation]) => {
      const [code, slot] = await Promise.all([
        client.getCode({ address: getAddress(address), ...pinned }),
        client.getStorageAt({
          address: getAddress(address),
          slot: implementationSlot,
          ...pinned,
        }),
      ]);
      if (
        !code ||
        code === '0x' ||
        slot?.slice(-40).toLowerCase() !== implementation.slice(2).toLowerCase()
      )
        throw new Error(
          'Borrowing manager or price feed changed. Writes require reverification.',
        );
    }),
  ]);
  const bo = getContract({
    address: deployment.operations.address,
    abi: borrowerOperationsAbi,
    client,
  });
  const manager = getContract({
    address: borrowingDeployment.manager,
    abi: borrowingSystemAbi,
    client,
  });
  const feed = getContract({
    address: borrowingDeployment.priceFeed,
    abi: priceFeedAbi,
    client,
  });
  const hints = getContract({
    address: deployment.hints.address,
    abi: hintHelpersAbi,
    client,
  });
  const sorted = getContract({
    address: deployment.sorted.address,
    abi: sortedTrovesAbi,
    client,
  });
  const bindings = await Promise.all([
    bo.read.musd(pinned),
    bo.read.troveManager(pinned),
    bo.read.priceFeed(pinned),
    bo.read.sortedTroves(pinned),
    bo.read.interestRateManager(pinned),
    bo.read.governableVariables(pinned),
    manager.read.musdToken(pinned),
    manager.read.priceFeed(pinned),
    manager.read.borrowerOperations(pinned),
    feed.read.oracle(pinned),
    hints.read.troveManager(pinned),
    hints.read.borrowerOperations(pinned),
    hints.read.sortedTroves(pinned),
    sorted.read.troveManager(pinned),
    sorted.read.borrowerOperationsAddress(pinned),
  ]);
  const expected = [
    expectedMusd,
    borrowingDeployment.manager,
    borrowingDeployment.priceFeed,
    deployment.sorted.address,
    deployment.interest.address,
    deployment.governance.address,
    expectedMusd,
    borrowingDeployment.priceFeed,
    deployment.operations.address,
    borrowingDeployment.oracle,
    borrowingDeployment.manager,
    deployment.operations.address,
    deployment.sorted.address,
    borrowingDeployment.manager,
    deployment.operations.address,
  ];
  if (
    bindings.some(
      (address, i) => getAddress(address) !== getAddress(expected[i]),
    )
  )
    throw new Error(
      'Borrowing contract bindings do not match the verified deployment.',
    );
  const [
    price,
    round,
    digits,
    status,
    amounts,
    capacity,
    rate,
    openingRate,
    accrued,
    systemDebt,
    systemCollateral,
    minimumRatio,
    criticalRatio,
    minNetDebt,
    gasReserve,
    feeRate,
    feeExempt,
    walletMusd,
    walletBtc,
  ] = await Promise.all([
    feed.read.fetchPrice(pinned),
    client.readContract({
      address: borrowingDeployment.oracle,
      abi: priceOracleAbi,
      functionName: 'latestRoundData',
      ...pinned,
    }),
    client.readContract({
      address: borrowingDeployment.oracle,
      abi: priceOracleAbi,
      functionName: 'decimals',
      ...pinned,
    }),
    manager.read.getTroveStatus([account], pinned),
    manager.read.getEntireDebtAndColl([account], pinned),
    manager.read.getTroveMaxBorrowingCapacity([account], pinned),
    manager.read.getTroveInterestRate([account], pinned),
    client.readContract({
      address: deployment.interest.address,
      abi: interestManagerAbi,
      functionName: 'interestRate',
      ...pinned,
    }),
    client.readContract({
      address: deployment.interest.address,
      abi: interestManagerAbi,
      functionName: 'getAccruedInterest',
      ...pinned,
    }),
    bo.read.getEntireSystemDebt(pinned),
    bo.read.getEntireSystemColl(pinned),
    bo.read.MCR(pinned),
    bo.read.CCR(pinned),
    bo.read.minNetDebt(pinned),
    bo.read.MUSD_GAS_COMPENSATION(pinned),
    bo.read.borrowingRate(pinned),
    client.readContract({
      address: deployment.governance.address,
      abi: governableVariablesAbi,
      functionName: 'isAccountFeeExempt',
      args: [account],
      ...pinned,
    }),
    client.readContract({
      address: expectedMusd,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [account],
      ...pinned,
    }),
    client.getBalance({ address: account, ...pinned }),
  ]);
  if (
    status > 4 ||
    price !== scaleOraclePrice(round[1], digits) ||
    round[3] <= 0n ||
    round[3] > block.timestamp ||
    block.timestamp - round[3] > 60n
  )
    throw new Error('Loan oracle or position status is invalid or stale.');
  const [tcr, recovery] = await Promise.all([
    manager.read.getTCR([price], pinned),
    manager.read.checkRecoveryMode([price], pinned),
  ]);
  if (
    tcr !== collateralRatio(systemCollateral, systemDebt, price) ||
    recovery !== tcr < criticalRatio
  )
    throw new Error('System collateral ratio did not reconcile.');
  const active = status === 1;
  const snapshot: LoanSnapshot = {
    account,
    active,
    blockNumber: block.number,
    blockHash: block.hash,
    chainTime: block.timestamp,
    oracleUpdatedAt: round[3],
    collateral: active ? amounts[0] : 0n,
    debt: active ? amounts[1] + amounts[2] : 0n,
    price,
    systemCollateral,
    systemDebt: systemDebt + accrued,
    minimumRatio,
    criticalRatio,
    minNetDebt,
    gasReserve,
    feeRate,
    feeExempt,
    maxBorrowingCapacity: capacity,
    rate,
    openingRate,
    walletMusd,
    walletBtc,
  };
  assertLoanFresh(snapshot);
  const canonical = await client.getBlock({ blockNumber: block.number });
  if (canonical.hash !== block.hash)
    throw new Error(
      'Source block changed during the quote. Refresh and review again.',
    );
  return snapshot;
}

/** Build only owner-direct calls. This helper never signs or broadcasts. */
export async function prepareLoanAction(
  client: PublicClient,
  snapshot: LoanSnapshot,
  input: LoanInput,
) {
  assertLoanFresh(snapshot);
  const quote = quoteLoan(snapshot, input);
  if (!quote.eligible || !quote.nominalRatio)
    throw new Error(quote.reasons.join(' '));
  if (quote.repayment > snapshot.walletMusd)
    throw new Error('Insufficient wallet MUSD for repayment.');
  const [hint] = await client.readContract({
    address: deployment.hints.address,
    abi: hintHelpersAbi,
    functionName: 'getApproxHint',
    args: [quote.nominalRatio, 64n, snapshot.blockNumber],
    blockNumber: snapshot.blockNumber,
  });
  const [upper, lower] = await client.readContract({
    address: deployment.sorted.address,
    abi: sortedTrovesAbi,
    functionName: 'findInsertPosition',
    args: [quote.nominalRatio, hint, hint],
    blockNumber: snapshot.blockNumber,
  });
  const common = {
    account: snapshot.account,
    address: deployment.operations.address,
    abi: borrowerOperationsAbi,
  } as const;
  const value = input.collateralAdded;
  const call =
    input.operation === 'open'
      ? ({
          ...common,
          functionName: 'openTrove',
          args: [input.amount, upper, lower],
          value,
        } as const)
      : input.operation === 'add-collateral'
        ? ({
            ...common,
            functionName: 'addColl',
            args: [upper, lower],
            value,
          } as const)
        : input.operation === 'repay'
          ? ({
              ...common,
              functionName: 'repayMUSD',
              args: [input.amount, upper, lower],
            } as const)
          : value > 0n
            ? ({
                ...common,
                functionName: 'adjustTrove',
                args: [0n, input.amount, true, upper, lower],
                value,
              } as const)
            : ({
                ...common,
                functionName: 'withdrawMUSD',
                args: [input.amount, upper, lower],
              } as const);
  const transaction = {
    account: snapshot.account,
    to: deployment.operations.address,
    data: encodeFunctionData(call),
    value,
  };
  await client.call(transaction);
  const gas = await client.estimateGas(transaction);
  const gasPrice = await client.getGasPrice();
  // Retain a conservative two-transaction gas budget after this action for approval/funding.
  const gasBudget = gas * gasPrice * 2n + 500_000n * gasPrice * 2n;
  if (value + gasBudget > snapshot.walletBtc)
    throw new Error(
      'Insufficient BTC for collateral and the remaining transaction gas budget.',
    );
  assertLoanFresh(snapshot);
  return { transaction, quote, gas, gasBudget };
}
