import { defineChain, getAddress, isAddress, parseAbi } from 'viem';
export * from './borrowing';
export * from './stress';

export const TESTNET_CHAIN_ID = 31611;
export const DEFAULT_RPC = 'https://rpc.test.mezo.org';
export const DEFAULT_EXPLORER = 'https://explorer.test.mezo.org';
export const mezoTestnet = defineChain({
  id: TESTNET_CHAIN_ID,
  name: 'Mezo Testnet',
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
  rpcUrls: { default: { http: [DEFAULT_RPC] } },
  blockExplorers: { default: { name: 'Mezo Explorer', url: DEFAULT_EXPLORER } },
  testnet: true,
});

export function optionalAddress(value: string | undefined) {
  return value && isAddress(value) && BigInt(value) !== 0n
    ? getAddress(value)
    : undefined;
}

export function vestedAmount(
  total: bigint,
  start: bigint,
  end: bigint,
  now: bigint,
) {
  if (total < 0n || end <= start) throw new Error('Invalid schedule');
  if (now <= start) return 0n;
  if (now >= end) return total;
  return (total * (now - start)) / (end - start);
}

export function freeCash(balance: bigint, reserve: bigint) {
  if (balance < 0n || reserve < 0n)
    throw new Error('Amounts must be nonnegative');
  return balance > reserve ? balance - reserve : 0n;
}

export const paymentsAbi = parseAbi([
  'struct Schedule { address sender; address recipient; uint256 total; uint64 start; uint64 end; uint256 claimed; bool cancelled; uint256 vestedAtCancellation; bytes32 referenceHash; }',
  'function musd() view returns (address)',
  'function getSchedule(uint256 id) view returns (Schedule)',
  'function getSenderScheduleIds(address sender, uint256 offset, uint256 limit) view returns (uint256[])',
  'function getRecipientScheduleIds(address recipient, uint256 offset, uint256 limit) view returns (uint256[])',
  'function createSchedule(address recipient, uint256 totalAmount, uint64 start, uint64 end, bytes32 referenceHash) returns (uint256)',
  'function claim(uint256 id)',
  'function cancel(uint256 id)',
  'function claimable(uint256 id) view returns (uint256)',
  'event ScheduleCreated(uint256 indexed scheduleId, address indexed sender, address indexed recipient, uint256 total, uint64 start, uint64 end, bytes32 referenceHash)',
  'event Claimed(uint256 indexed scheduleId, address indexed recipient, uint256 amount)',
  'event Cancelled(uint256 indexed scheduleId, address indexed sender, uint256 refund, uint256 vested)',
]);
