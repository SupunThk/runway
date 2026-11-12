import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createPublicClient, encodeFunctionData, http } from 'viem';
import {
  borrowingDeployment,
  priceOracleAbi,
} from '../packages/mezo/src/borrowing.ts';

// Only public RPC reads reach the network. All EVM writes stay inside Forge.
const root = fileURLToPath(new URL('../', import.meta.url));
const client = createPublicClient({
  transport: http('https://rpc.test.mezo.org', {
    timeout: 15000,
    retryCount: 1,
  }),
});
if ((await client.getChainId()) !== 31611)
  throw new Error('Wrong fork source network.');
const blockNumber = await client.getBlockNumber({ cacheTime: 0 }),
  block = await client.getBlock({ blockNumber });
if (!block.hash || Date.now() / 1000 - Number(block.timestamp) > 120)
  throw new Error('Fork source is not current.');
const [round, decimals] = await Promise.all(
  ['latestRoundData', 'decimals'].map((functionName) =>
    client.call({
      to: borrowingDeployment.oracle,
      data: encodeFunctionData({ abi: priceOracleAbi, functionName }),
      blockNumber,
    }),
  ),
);
if (!round.data || !decimals.data)
  throw new Error('Native oracle response unavailable.');
const isolated = await mkdtemp(join(tmpdir(), 'runway-fork-'));
await mkdir(join(isolated, 'test'));
await writeFile(
  join(isolated, 'foundry.toml'),
  '[profile.default]\nsolc_version = "0.8.28"\nevm_version = "london"\noptimizer = true\noptimizer_runs = 200\n',
);
await writeFile(
  join(isolated, 'test', 'MezoFork.t.sol'),
  await readFile(join(root, 'contracts/test/MezoFork.t.sol')),
);
const packagePath = realpathSync(join(root, 'node_modules/@foundry-rs/forge'));
const require = createRequire(join(packagePath, 'package.json'));
const { BINARY_NAME, PLATFORM_SPECIFIC_PACKAGE_NAME } = await import(
  new URL('../node_modules/@foundry-rs/forge/const.mjs', import.meta.url)
);
const binary = require.resolve(
  `${PLATFORM_SPECIFIC_PACKAGE_NAME('forge')}/bin/${BINARY_NAME('forge')}`,
);
const env = Object.fromEntries(
  [
    'PATH',
    'Path',
    'SystemRoot',
    'SYSTEMROOT',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'HOME',
  ]
    .filter((key) => process.env[key])
    .map((key) => [key, process.env[key]]),
);
const result = spawnSync(
  binary,
  [
    'test',
    '--root',
    isolated,
    '--match-contract',
    'MezoForkTest',
    '--fork-url',
    'https://rpc.test.mezo.org',
    '--fork-block-number',
    String(blockNumber),
    '-vv',
  ],
  {
    cwd: isolated,
    env: {
      ...env,
      RUNWAY_FORK_ENABLED: 'true',
      RUNWAY_FORK_ORACLE_ROUND: round.data,
      RUNWAY_FORK_ORACLE_DECIMALS: decimals.data,
    },
    encoding: 'utf8',
    timeout: 240000,
    maxBuffer: 1024 * 1024,
  },
);
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
console.log(output.slice(-16000));
const report = {
  checkedAt: new Date().toISOString(),
  status: result.status === 0 ? 'passed' : 'failed',
  blockNumber: String(blockNumber),
  blockHash: block.hash,
  chainTime: String(block.timestamp),
  oracle:
    'Native oracle calls replay the actual RPC response from the exact fork block because Forge does not implement Mezo native precompiles.',
  execution:
    'Local fork EVM only; synthetic actor BTC balance; no key, wallet, broadcast transaction, production database, or dotenv loading.',
  environment:
    'Fresh temporary non-repository project with explicit root and allowlisted environment variables.',
  sourceTest: 'contracts/test/MezoFork.t.sol',
  temporaryProject: isolated,
  exitCode: result.status,
  error: result.error?.message ?? null,
};
await mkdir(join(root, '.tools'), { recursive: true });
await writeFile(
  join(root, '.tools/loan-fork.check.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
process.exitCode = result.status === 0 ? 0 : 1;
