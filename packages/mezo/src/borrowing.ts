import { getAddress, parseAbi, type Address, type PublicClient } from 'viem';

// Official matsnet deployments at mezo-org/musd commit aa25fd6.
// Implementations, token binding and ABI reads reconciled on chain 31611.
export const borrowingDeployment = {
  chainId: 31611,
  manager: getAddress('0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0'),
  managerImplementation: '0x9aab567966983e95536fc460c12266fb0cc10b07',
  priceFeed: getAddress('0x86bCF0841622a5dAC14A313a15f96A95421b9366'),
  priceImplementation: '0xec42b37c12b8d73d320f4075a1bcd58b306629c1',
  musd: getAddress('0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503'),
  oracle: getAddress('0x7b7c000000000000000000000000000000000015'),
} as const;
export const implementationSlot =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
export const borrowingAbi = parseAbi([
  'function musdToken() view returns (address)',
  'function priceFeed() view returns (address)',
  'function getTroveStatus(address) view returns (uint8)',
  'function getEntireDebtAndColl(address) view returns (uint256 coll, uint256 principal, uint256 interest, uint256 pendingCollateral, uint256 pendingPrincipal, uint256 pendingInterest)',
  'function getTroveInterestRate(address) view returns (uint16)',
  'function getCurrentICR(address,uint256) view returns (uint256)',
  'function MCR() view returns (uint256)',
  'function MUSD_GAS_COMPENSATION() view returns (uint256)',
]);
export const priceFeedAbi = parseAbi([
  'function oracle() view returns (address)',
  'function fetchPrice() view returns (uint256)',
]);
export const priceOracleAbi = parseAbi([
  'function decimals() view returns (uint8)',
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
]);

export function scaleOraclePrice(answer: bigint, decimals: number) {
  if (
    answer <= 0n ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 36
  )
    throw new Error('Invalid protocol oracle price or decimals.');
  const scaled =
    decimals > 18
      ? answer / 10n ** BigInt(decimals - 18)
      : answer * 10n ** BigInt(18 - decimals);
  if (scaled === 0n) throw new Error('Protocol oracle price rounded to zero.');
  return scaled;
}

export async function readBorrowingPosition(
  client: PublicClient,
  account: Address,
  expectedMusd: Address,
) {
  if (getAddress(expectedMusd) !== borrowingDeployment.musd)
    throw new Error('Borrowing deployment does not match the configured MUSD.');
  const [chainId, block] = await Promise.all([
    client.getChainId(),
    client.getBlock(),
  ]);
  if (chainId !== borrowingDeployment.chainId)
    throw new Error('Borrowing RPC is on the wrong network.');
  const { manager, priceFeed } = borrowingDeployment;
  const pinned = { blockNumber: block.number };
  const [code, implementation, token, linkedPrice] = await Promise.all([
    client.getCode({ address: manager, ...pinned }),
    client.getStorageAt({
      address: manager,
      slot: implementationSlot,
      ...pinned,
    }),
    client.readContract({
      address: manager,
      abi: borrowingAbi,
      functionName: 'musdToken',
      ...pinned,
    }),
    client.readContract({
      address: manager,
      abi: borrowingAbi,
      functionName: 'priceFeed',
      ...pinned,
    }),
  ]);
  if (
    !code ||
    code === '0x' ||
    implementation?.slice(-40).toLowerCase() !==
      borrowingDeployment.managerImplementation.slice(2) ||
    getAddress(token) !== borrowingDeployment.musd ||
    getAddress(linkedPrice) !== priceFeed
  )
    throw new Error(
      'Borrowing deployment changed or failed validation. Position reads need reverification.',
    );
  const status = await client.readContract({
    address: manager,
    abi: borrowingAbi,
    functionName: 'getTroveStatus',
    args: [account],
    ...pinned,
  });
  if (status > 4) throw new Error('Unsupported borrowing position status.');
  const base = {
    account,
    status,
    blockNumber: block.number,
    chainTime: block.timestamp,
  };
  if (status !== 1) return { ...base, active: false as const };
  const [amounts, rate, minimumRatio, gasReserve] = await Promise.all([
    client.readContract({
      address: manager,
      abi: borrowingAbi,
      functionName: 'getEntireDebtAndColl',
      args: [account],
      ...pinned,
    }),
    client.readContract({
      address: manager,
      abi: borrowingAbi,
      functionName: 'getTroveInterestRate',
      args: [account],
      ...pinned,
    }),
    client.readContract({
      address: manager,
      abi: borrowingAbi,
      functionName: 'MCR',
      ...pinned,
    }),
    client.readContract({
      address: manager,
      abi: borrowingAbi,
      functionName: 'MUSD_GAS_COMPENSATION',
      ...pinned,
    }),
  ]);
  // The first three totals ALREADY include pending redistribution amounts.
  const [collateral, principal, interest] = amounts;
  const debt = principal + interest;
  if (debt <= 0n || collateral <= 0n || minimumRatio <= 0n)
    throw new Error(
      'Active position has inconsistent debt, collateral or threshold.',
    );
  const position = {
    ...base,
    active: true as const,
    collateral,
    principal,
    interest,
    debt,
    rate,
    minimumRatio,
    gasReserve,
  };
  try {
    const [priceCode, priceImplementation, oracle] = await Promise.all([
      client.getCode({ address: priceFeed, ...pinned }),
      client.getStorageAt({
        address: priceFeed,
        slot: implementationSlot,
        ...pinned,
      }),
      client.readContract({
        address: priceFeed,
        abi: priceFeedAbi,
        functionName: 'oracle',
        ...pinned,
      }),
    ]);
    if (
      !priceCode ||
      priceCode === '0x' ||
      priceImplementation?.slice(-40).toLowerCase() !==
        borrowingDeployment.priceImplementation.slice(2) ||
      getAddress(oracle) !== borrowingDeployment.oracle
    )
      throw new Error(
        'Protocol price deployment changed or failed validation.',
      );
    const [round, digits, price] = await Promise.all([
      client.readContract({
        address: oracle,
        abi: priceOracleAbi,
        functionName: 'latestRoundData',
        ...pinned,
      }),
      client.readContract({
        address: oracle,
        abi: priceOracleAbi,
        functionName: 'decimals',
        ...pinned,
      }),
      client.readContract({
        address: priceFeed,
        abi: priceFeedAbi,
        functionName: 'fetchPrice',
        ...pinned,
      }),
    ]);
    const updatedAt = round[3];
    // The verified Mezo native oracle reports answeredInRound=0; use its
    // timestamp and the protocol feed's own validity checks instead.
    if (
      updatedAt <= 0n ||
      updatedAt > block.timestamp ||
      block.timestamp - updatedAt > 60n
    )
      throw new Error('Protocol oracle timestamp is stale or invalid.');
    if (price !== scaleOraclePrice(round[1], digits))
      throw new Error('Protocol and oracle prices do not match.');
    const ratio = await client.readContract({
      address: manager,
      abi: borrowingAbi,
      functionName: 'getCurrentICR',
      args: [account, price],
      ...pinned,
    });
    if (ratio !== (collateral * price) / debt)
      throw new Error(
        'Protocol collateral ratio did not reconcile with debt and collateral.',
      );
    return {
      ...position,
      price: { value: price, updatedAt, ratio },
      priceError: undefined,
    };
  } catch (error) {
    return {
      ...position,
      price: undefined,
      priceError:
        error instanceof Error
          ? error.message.split('\n')[0]
          : 'Protocol price unavailable.',
    };
  }
}
