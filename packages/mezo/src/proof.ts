import {
  erc20Abi,
  isAddress,
  keccak256,
  parseAbi,
  type Address,
  type Hash,
  type PublicClient,
} from 'viem';
import { paymentsAbi, TESTNET_CHAIN_ID } from './index';

const obligationAbi = parseAbi([
  'function outstandingObligations() view returns (uint256)',
]);
export type ProofAnchor = {
  blockNumber: bigint;
  blockHash: Hash;
  chainTime: bigint;
  balance: bigint;
  obligations: bigint;
};
export type ProofRow = {
  id: bigint;
  recipient: Address;
  total: bigint;
  claimed: bigint;
  refunded: bigint;
  remaining: bigint;
  end: bigint;
  active: boolean;
};
export async function readFundingProofPage(
  client: PublicClient,
  config: { contract: Address; token: Address; codeHash: Hash },
  owner: Address,
  offset = 0,
  anchor?: ProofAnchor,
) {
  if (
    !isAddress(owner) ||
    BigInt(owner) === 0n ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 9900
  )
    throw new Error('Invalid proof address or page.');
  if ((await client.getChainId()) !== TESTNET_CHAIN_ID)
    throw new Error('Wrong proof network.');
  const tip = await client.getBlock();
  const age = Date.now() / 1000 - Number(tip.timestamp);
  if (age > 120 || age < -30 || tip.number === null || tip.number < 12n)
    throw new Error('Current chain data is unavailable or stale.');
  const number = anchor?.blockNumber ?? tip.number - 12n;
  const block = await client.getBlock({ blockNumber: number });
  if (!block.hash || (anchor && block.hash !== anchor.blockHash))
    throw new Error(
      'The proof snapshot changed. Refresh to obtain a canonical snapshot.',
    );
  if (!anchor) {
    const [code, token, balance, obligations, decimals, symbol] =
      await Promise.all([
        client.getCode({ address: config.contract, blockNumber: number }),
        client.readContract({
          address: config.contract,
          abi: paymentsAbi,
          functionName: 'musd',
          blockNumber: number,
        }),
        client.readContract({
          address: config.token,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [config.contract],
          blockNumber: number,
        }),
        client.readContract({
          address: config.contract,
          abi: obligationAbi,
          functionName: 'outstandingObligations',
          blockNumber: number,
        }),
        client.readContract({
          address: config.token,
          abi: erc20Abi,
          functionName: 'decimals',
          blockNumber: number,
        }),
        client.readContract({
          address: config.token,
          abi: erc20Abi,
          functionName: 'symbol',
          blockNumber: number,
        }),
      ]);
    if (
      !code ||
      keccak256(code) !== config.codeHash ||
      token.toLowerCase() !== config.token.toLowerCase() ||
      decimals !== 18 ||
      symbol !== 'MUSD'
    )
      throw new Error(
        'The proof contract or token identity does not match this deployment.',
      );
    anchor = {
      blockNumber: number,
      blockHash: block.hash,
      chainTime: block.timestamp,
      balance,
      obligations,
    };
  }
  const ids = await client.readContract({
    address: config.contract,
    abi: paymentsAbi,
    functionName: 'getSenderScheduleIds',
    args: [owner, BigInt(offset), 100n],
    blockNumber: number,
  });
  if (
    ids.length > 100 ||
    new Set(ids.map(String)).size !== ids.length ||
    ids.some((id) => id <= 0n)
  )
    throw new Error('Inconsistent sender schedule discovery.');
  const results = await Promise.allSettled(
    ids.map(async (id): Promise<ProofRow> => {
      const row = await client.readContract({
        address: config.contract,
        abi: paymentsAbi,
        functionName: 'getSchedule',
        args: [id],
        blockNumber: number,
      });
      const cap = row.cancelled ? row.vestedAtCancellation : row.total;
      if (
        row.sender.toLowerCase() !== owner.toLowerCase() ||
        cap > row.total ||
        row.claimed > cap ||
        row.end <= row.start ||
        !isAddress(row.recipient)
      )
        throw new Error('Inconsistent schedule.');
      return {
        id,
        recipient: row.recipient,
        total: row.total,
        claimed: row.claimed,
        refunded: row.total - cap,
        remaining: cap - row.claimed,
        end: row.end,
        active: !row.cancelled && row.end > block.timestamp,
      };
    }),
  );
  const final = await client.getBlock({ blockNumber: number });
  if (final.hash !== anchor.blockHash)
    throw new Error(
      'The proof snapshot was reorganized. Refresh before using these amounts.',
    );
  return {
    anchor,
    offset,
    rows: results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])),
    failed: results.filter((r) => r.status === 'rejected').length,
    hasMore: ids.length === 100,
    nextOffset: offset + ids.length,
    capped: offset >= 9900 && ids.length === 100,
  };
}
export function aggregateFundingProof(rows: ProofRow[]) {
  if (new Set(rows.map((r) => String(r.id))).size !== rows.length)
    throw new Error('Duplicate schedule pages; refresh proof.');
  return {
    committed: rows.reduce((n, r) => n + r.remaining, 0n),
    funded: rows.reduce((n, r) => n + r.total, 0n),
    claimed: rows.reduce((n, r) => n + r.claimed, 0n),
    refunded: rows.reduce((n, r) => n + r.refunded, 0n),
    active: rows.filter((r) => r.active).length,
    recipients: new Set(rows.map((r) => r.recipient.toLowerCase())).size,
  };
}
