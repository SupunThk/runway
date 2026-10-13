import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const source = new URL('apps/web/dist/', root);
const destination = new URL('.publish/mezo-runway-testnet/', root);
// Publish only compiled public assets, never the root .env or wallet tooling.
await readFile(new URL('index.html', source));
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
await writeFile(
  new URL('vercel.json', destination),
  JSON.stringify(
    {
      framework: null,
      buildCommand: '',
      installCommand: '',
      rewrites: [
        { source: '/schedules/:id', destination: '/index.html' },
        { source: '/docs', destination: '/index.html' },
        { source: '/docs/', destination: '/index.html' },
        { source: '/workspace', destination: '/index.html' },
        { source: '/workspace/', destination: '/index.html' },
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log(`Static frontend ready: ${fileURLToPath(destination)}`);
