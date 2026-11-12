import { createPublicClient, http, isAddress } from 'viem';
import { readLoanSnapshot } from '../packages/mezo/src/borrowing-write.ts';
import { borrowingDeployment } from '../packages/mezo/src/borrowing.ts';
const address = process.argv[2];
if (!address || !isAddress(address))
  throw new Error(
    'Usage: node scripts/inspect-borrowing-writes.mjs <public-wallet-address>',
  );
// Public testnet RPC only. No dotenv loading, wallet, private key or signing transport.
const client = createPublicClient({
  transport: http('https://rpc.test.mezo.org'),
});
const snapshot = await readLoanSnapshot(
  client,
  address,
  borrowingDeployment.musd,
);
console.log(
  JSON.stringify(
    snapshot,
    (_, v) => (typeof v === 'bigint' ? v.toString() : v),
    2,
  ),
);
