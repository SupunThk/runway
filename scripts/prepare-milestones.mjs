import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { encodeDeployData, getAddress, keccak256, stringToHex } from 'viem';

// Offline preparation only. No dotenv, keys, RPC, wallet connection or broadcast.
const artifactPath = 'contracts/out/RunwayMilestones.sol/RunwayMilestones.json';
const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
const dependencies = JSON.parse(
  await readFile('deployments/mezo-testnet.dependencies.json', 'utf8'),
);
const token = getAddress(dependencies.contracts.musd.address);
const metadata =
  typeof artifact.metadata === 'string'
    ? JSON.parse(artifact.metadata)
    : artifact.metadata;
if (
  metadata.compiler.version !== '0.8.28+commit.7893614a' ||
  metadata.settings.evmVersion !== 'london' ||
  metadata.settings.optimizer.runs !== 200
)
  throw new Error('Unexpected milestone compiler settings.');
const sources = {};
for (const [path, expected] of Object.entries(metadata.sources)) {
  const file = resolve('contracts', path);
  if (
    !file.startsWith(resolve('.') + '\\') &&
    !file.startsWith(resolve('.') + '/')
  )
    throw new Error('Unexpected compiler source path.');
  const content = await readFile(file, 'utf8');
  if (keccak256(stringToHex(content)) !== expected.keccak256)
    throw new Error(
      `Compiled source changed: ${path}. Rebuild before preparing.`,
    );
  sources[path] = { content };
}
const settings = { ...metadata.settings };
delete settings.compilationTarget;
const input = {
  language: 'Solidity',
  sources,
  settings: {
    ...settings,
    outputSelection: {
      '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'metadata'] },
    },
  },
};
const source = await readFile('contracts/src/RunwayMilestones.sol', 'utf8');
if (input.sources['src/RunwayMilestones.sol']?.content !== source)
  throw new Error(
    'Compiled milestone source is out of date. Rebuild before preparing.',
  );
await mkdir('deployments/verification', { recursive: true });
await writeFile(
  'deployments/verification/RunwayMilestones.standard-input.json',
  JSON.stringify(input, null, 2) + '\n',
);
const report = {
  preparedAt: new Date().toISOString(),
  status: 'prepared-not-deployed',
  contract: 'RunwayMilestones',
  chainId: 31611,
  musd: token,
  artifact: artifactPath,
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  creationBytecodeHash: keccak256(artifact.bytecode.object),
  creationDataHash: keccak256(
    encodeDeployData({
      abi: artifact.abi,
      bytecode: artifact.bytecode.object,
      args: [token],
    }),
  ),
  compiler: metadata.compiler.version,
  evmVersion: 'london',
  optimizerRuns: 200,
  verificationInput:
    'deployments/verification/RunwayMilestones.standard-input.json',
  deployed: false,
  broadcast: false,
  next: 'User reviews the contract/tests, runs node scripts/deploy-browser.mjs --contract milestones --founder <public-address>, selects RunwayMilestones and signs. Provide the deployment address/hash for independent verification before app integration. This file is preparation evidence, not a deployment manifest.',
};
await writeFile(
  'deployments/milestones-preparation.check.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  `Milestone deployment prepared offline. Creation bytecode hash: ${report.creationBytecodeHash}. No deployment or transaction occurred.`,
);
