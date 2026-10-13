import { readFile, writeFile } from 'node:fs/promises';

const input = process.argv[2];
if (!input)
  throw new Error(
    'Usage: node scripts/configure-api-proxy.mjs https://your-service.onrender.com',
  );
const url = new URL(input);
if (
  url.protocol !== 'https:' ||
  url.username ||
  url.password ||
  url.pathname !== '/' ||
  url.search ||
  url.hash ||
  !url.hostname.endsWith('.onrender.com')
) {
  throw new Error(
    'Provide the HTTPS origin of your actual onrender.com service, without a path or credentials.',
  );
}
const file = new URL('../vercel.json', import.meta.url);
const config = JSON.parse(await readFile(file, 'utf8'));
config.rewrites = [
  { source: '/api/:path*', destination: `${url.origin}/api/:path*` },
  ...(config.rewrites ?? []).filter((rule) => rule.source !== '/api/:path*'),
];
await writeFile(file, `${JSON.stringify(config, null, 2)}\n`);
console.log(
  `Frontend API proxy configured for ${url.origin}. Redeploy Vercel to activate it.`,
);
