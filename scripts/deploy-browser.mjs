import { createServer } from 'vite';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { getAddress } from 'viem';

const dependencies = JSON.parse(
  await readFile('deployments/mezo-testnet.dependencies.json', 'utf8'),
);
const founder = getAddress(process.env.FOUNDER_ADDRESS || '');
const server = await createServer({
  configFile: false,
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
  },
});
await server.listen();
server.printUrls();
