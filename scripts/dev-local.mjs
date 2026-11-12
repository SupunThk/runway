import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { startTestBackend } from '../apps/api/test-fixture.ts';
import { parseAdminWallets } from '../apps/api/src/admin.ts';

const port = Number(process.env.RUNWAY_LOCAL_PORT || 5300);
// An ambient provider key must never enable paid inference in this sandbox.
process.env.ASSISTANT_ENABLED = 'false';
const adminFlag = process.argv.indexOf('--admin-wallet');
const settingsUrl = new URL('../.runway-local.json', import.meta.url);
const settings = existsSync(settingsUrl)
  ? JSON.parse(readFileSync(settingsUrl, 'utf8'))
  : undefined;
if (
  settings &&
  (settings.version !== 1 ||
    (settings.adminWallet !== undefined &&
      typeof settings.adminWallet !== 'string'))
)
  throw new Error(
    'Invalid local settings. Expected version 1 and an optional public adminWallet.',
  );
const adminWallet =
  adminFlag >= 0 ? process.argv[adminFlag + 1] : settings?.adminWallet;
if (adminFlag >= 0 && !adminWallet)
  throw new Error('Pass a public wallet address after --admin-wallet.');
if (adminWallet && parseAdminWallets(adminWallet).size !== 1)
  throw new Error('The admin wallet must be a valid nonzero public address.');
const backend = await startTestBackend({
  origin: `http://127.0.0.1:${port}`,
  adminWallets: adminWallet ? [adminWallet] : [],
});
const child = spawn(process.execPath, ['scripts/local-web.mjs'], {
  stdio: 'inherit',
  env: { ...process.env, RUNWAY_LOCAL_API: backend.url },
});
console.log(
  'Local development: temporary MongoDB, public testnet settings. Records are discarded on exit.',
);
let closing = false;
async function close(code = 0) {
  if (closing) return;
  closing = true;
  child.kill();
  await backend.close();
  process.exit(code);
}
child.on('error', () => void close(1));
child.on('exit', (code) => void close(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => void close());
