import { writeFile } from 'node:fs/promises';
import { createPublicClient, getAddress, http } from 'viem';
import {
  borrowingDeployment,
  readBorrowingPosition,
} from '../packages/mezo/src/borrowing.ts';

// Read-only evidence, Node 24+. No wallet, signing, or borrowing transactions.
const accounts = process.argv.slice(2);
if (!accounts.length)
  accounts.push(
    '0x1ac891Ce491851AC87851D62B9184c75A76f55cF',
    '0x99d7a7dcf20a0ac9fc3D03Cd90b0a1F4BC561b09',
  );
const client = createPublicClient({
  transport: http('https://rpc.test.mezo.org', {
    timeout: 15000,
    retryCount: 1,
  }),
});
const positions = [];
for (const account of accounts)
  positions.push(
    await readBorrowingPosition(
      client,
      getAddress(account),
      borrowingDeployment.musd,
    ),
  );
const report = {
  checkedAt: new Date().toISOString(),
  source:
    'https://github.com/mezo-org/musd/tree/aa25fd6defbe6c1385940e183ea7a0a3df4533d8/solidity',
  deployment: borrowingDeployment,
  positions,
};
const output =
  JSON.stringify(
    report,
    (_, value) => (typeof value === 'bigint' ? value.toString() : value),
    2,
  ) + '\n';
await writeFile('deployments/mezo-testnet.borrowing.check.json', output);
console.log(output);
