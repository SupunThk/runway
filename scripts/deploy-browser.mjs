import { createServer } from 'vite';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { getAddress } from 'viem';

const dependencies = JSON.parse(
  await readFile('deployments/mezo-testnet.dependencies.json', 'utf8'),
);
const founderFlag = process.argv.indexOf('--founder');
const founder = getAddress(
  (founderFlag >= 0
    ? process.argv[founderFlag + 1]
    : process.env.FOUNDER_ADDRESS) || '',
);
const contractFlag = process.argv.indexOf('--contract');
const selectedContract =
  contractFlag >= 0 ? process.argv[contractFlag + 1] : 'payments';
if (!['payments', 'milestones'].includes(selectedContract))
  throw new Error('Choose --contract payments or milestones.');
const server = await createServer({
  configFile: false,
  envDir: false,
  root: resolve('scripts/deploy'),
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    fs: { allow: [resolve('.')] },
  },
  define: {
    __FOUNDER__: JSON.stringify(founder),
    __MUSD__: JSON.stringify(dependencies.contracts.musd.address),
    __CONTRACT__: JSON.stringify(selectedContract),
  },
});
await server.listen();
server.printUrls();
