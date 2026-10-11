import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  createPublicClient,
  encodeDeployData,
  encodeAbiParameters,
  http,
  keccak256,
  stringToHex,
} from 'viem';

// No signing keys, wallet access or transactions. --submit publishes public source.
const record = JSON.parse(
  await readFile('deployments/mezo-testnet.payments.json', 'utf8'),
);
const artifact = JSON.parse(await readFile(record.artifact, 'utf8'));
const api = 'https://api.explorer.test.mezo.org';
const explorerUrl = `https://explorer.test.mezo.org/address/${record.address}?tab=contract`;
function requireMatch(ok, message) {
  if (!ok) throw new Error(message);
}
function forge(args, capture = false) {
  const result = spawnSync(process.execPath, ['scripts/forge.mjs', ...args], {
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  requireMatch(
    result.status === 0,
    result.stderr || 'Foundry verification command failed.',
  );
  return result.stdout;
}
const compiler = artifact.metadata.compiler.version;
const baseArgs = [
  'verify-contract',
  record.address,
  'src/RunwayPayments.sol:RunwayPayments',
  '--root',
  'contracts',
  '--chain',
  '31611',
  '--compiler-version',
  compiler,
];
const input = JSON.parse(
  forge([...baseArgs, '--show-standard-json-input'], true),
);
requireMatch(
  compiler === '0.8.28+commit.7893614a',
  'Unexpected compiler version.',
);
requireMatch(
  input.settings.optimizer.enabled &&
    input.settings.optimizer.runs === 200 &&
    input.settings.evmVersion === 'london' &&
    !input.settings.viaIR,
  'Compiler settings differ from deployment.',
);
requireMatch(
  Object.keys(input.sources).length ===
    Object.keys(artifact.metadata.sources).length,
  'Source dependency set differs from deployment.',
);
for (const [path, source] of Object.entries(input.sources)) {
  requireMatch(
    keccak256(stringToHex(source.content)) ===
      artifact.metadata.sources[path]?.keccak256,
    `Source differs from deployed metadata: ${path}`,
  );
}
const source = await readFile('contracts/src/RunwayPayments.sol');
requireMatch(
  createHash('sha256').update(source).digest('hex') === record.sourceSha256,
  'Payment source differs from original deployment.',
);
requireMatch(
  keccak256(artifact.bytecode.object) === record.creationBytecodeHash,
  'Artifact creation bytecode differs from deployment.',
);
const client = createPublicClient({
  transport: http('https://rpc.test.mezo.org', {
    timeout: 15000,
    retryCount: 1,
  }),
});
requireMatch((await client.getChainId()) === 31611, 'Unexpected RPC chain.');
const [indexedResponse, code] = await Promise.all([
  fetch(`${api}/api/v2/transactions/${record.transactionHash}`, {
    signal: AbortSignal.timeout(20000),
  }),
  client.getCode({ address: record.address }),
]);
requireMatch(indexedResponse.ok, 'Indexed creation transaction unavailable.');
const tx = await indexedResponse.json();
const expectedInput = encodeDeployData({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
  args: [record.musd],
});
requireMatch(
  tx.hash === record.transactionHash &&
    tx.raw_input?.toLowerCase() === expectedInput.toLowerCase() &&
    tx.to === null &&
    tx.from?.hash?.toLowerCase() === record.deployer.toLowerCase(),
  'Creation transaction differs from the original artifact and constructor.',
);
requireMatch(
  tx.status === 'ok' &&
    tx.result === 'success' &&
    tx.created_contract?.hash?.toLowerCase() === record.address.toLowerCase() &&
    String(tx.block) === record.deploymentBlock,
  'Indexed deployment result mismatch.',
);
requireMatch(
  code && keccak256(code) === record.deployedBytecodeHash,
  'Deployed code changed.',
);
const inputPath = 'deployments/verification/RunwayPayments.standard-input.json';
await mkdir('deployments/verification', { recursive: true });
const inputText = JSON.stringify(input, null, 2) + '\n';
await writeFile(inputPath, inputText);
console.log(
  'Preflight passed: every source hash, compiler settings, constructor, creation transaction and deployed bytecode match the original deployment.',
);
if (process.argv.includes('--submit')) {
  const args = encodeAbiParameters([{ type: 'address' }], [record.musd]);
  forge([
    ...baseArgs,
    '--verifier',
    'blockscout',
    '--verifier-url',
    `${api}/api/`,
    '--constructor-args',
    args,
    '--watch',
    '--retries',
    '5',
    '--delay',
    '5',
  ]);
}
const response = await fetch(
  `${api}/api/v2/smart-contracts/${record.address}`,
  { signal: AbortSignal.timeout(20000) },
);
requireMatch(response.ok, `Explorer status request failed: ${response.status}`);
const status = await response.json();
const verified = status.is_verified === true;
if (verified) {
  requireMatch(
    status.is_fully_verified === true && status.is_partially_verified !== true,
    'Explorer source is not an exact full match.',
  );
  requireMatch(
    status.optimization_enabled === true &&
      status.optimization_runs === 200 &&
      status.evm_version === 'london',
    'Explorer compiler settings mismatch.',
  );
  requireMatch(
    status.constructor_args?.toLowerCase() ===
      encodeAbiParameters([{ type: 'address' }], [record.musd]).toLowerCase(),
    'Explorer constructor argument mismatch.',
  );
  requireMatch(
    status.name === 'RunwayPayments' &&
      status.compiler_version?.replace(/^v/, '') === compiler,
    'Explorer compiler or contract name mismatch.',
  );
  requireMatch(
    status.source_code === input.sources['src/RunwayPayments.sol'].content,
    'Explorer main source mismatch.',
  );
  for (const dependency of status.additional_sources ?? []) {
    requireMatch(
      dependency.source_code === input.sources[dependency.file_path]?.content,
      `Explorer dependency mismatch: ${dependency.file_path}`,
    );
  }
  requireMatch(
    (status.additional_sources?.length ?? 0) ===
      Object.keys(input.sources).length - 1,
    'Explorer dependency count mismatch.',
  );
}
const report = {
  checkedAt: new Date().toISOString(),
  address: record.address,
  chainId: 31611,
  explorerUrl,
  apiUrl: `${api}/api/v2/smart-contracts/${record.address}`,
  verified,
  fullyVerified: status.is_fully_verified ?? null,
  partiallyVerified: status.is_partially_verified ?? null,
  explorerLicenseType: status.license_type ?? null,
  compiler,
  evmVersion: input.settings.evmVersion,
  optimizerRuns: input.settings.optimizer.runs,
  sourceInput: inputPath,
  sourceInputSha256: createHash('sha256').update(inputText).digest('hex'),
  sourcePaths: Object.keys(input.sources),
  sourceSha256: record.sourceSha256,
  creationBytecodeHash: record.creationBytecodeHash,
  deployedBytecodeHash: keccak256(code),
  constructorArguments: encodeAbiParameters(
    [{ type: 'address' }],
    [record.musd],
  ),
  creationTransaction: record.transactionHash,
  explorerVerifiedAt: status.verified_at ?? null,
  creationEvidence:
    'Blockscout indexed creation transaction, input and successful result; live RPC deployed bytecode',
  newTransactions: 0,
};
await writeFile(
  'deployments/mezo-testnet.explorer.check.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--submit'))
  requireMatch(
    verified,
    'Explorer has not confirmed source verification yet; inspect status before resubmitting.',
  );
