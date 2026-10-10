import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  createPublicClient,
  encodeDeployData,
  getAddress,
  http,
  keccak256,
  parseAbi,
} from 'viem';

const [contractInput, transactionHash] = process.argv.slice(2);
const address = getAddress(contractInput || '');
if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash || ''))
  throw new Error('Provide the deployment transaction hash.');
const founder = getAddress(process.env.FOUNDER_ADDRESS || '');
const manifestPath = 'deployments/mezo-testnet.dependencies.json';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const token = getAddress(manifest.contracts.musd.address);
const artifact = JSON.parse(
  await readFile(
    'contracts/out/RunwayPayments.sol/RunwayPayments.json',
    'utf8',
  ),
);
const client = createPublicClient({
  transport: http(manifest.rpc, { timeout: 15000, retryCount: 1 }),
});
if ((await client.getChainId()) !== 31611)
  throw new Error('Expected Mezo testnet chain 31611.');
const [tx, receipt] = await Promise.all([
  client.getTransaction({ hash: transactionHash }),
  client.getTransactionReceipt({ hash: transactionHash }),
]);
if (
  receipt.status !== 'success' ||
  !receipt.contractAddress ||
  getAddress(receipt.contractAddress) !== address
)
  throw new Error('Deployment receipt does not match the supplied contract.');
if (getAddress(tx.from) !== founder || tx.to !== null)
  throw new Error('Expected a contract creation from the founder.');
const expectedInput = encodeDeployData({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
  args: [token],
});
if (tx.input.toLowerCase() !== expectedInput.toLowerCase())
  throw new Error(
    'Creation bytecode or constructor arguments differ from the local build.',
  );
const abi = parseAbi([
  'function musd() view returns (address)',
  'function scheduleCount() view returns (uint256)',
  'function outstandingObligations() view returns (uint256)',
]);
const block = await client.getBlockNumber();
const [code, deployedToken, count, obligations] = await Promise.all([
  client.getCode({ address, blockNumber: block }),
  client.readContract({
    address,
    abi,
    functionName: 'musd',
    blockNumber: block,
  }),
  client.readContract({
    address,
    abi,
    functionName: 'scheduleCount',
    blockNumber: block,
  }),
  client.readContract({
    address,
    abi,
    functionName: 'outstandingObligations',
    blockNumber: block,
  }),
]);
if (!code || code === '0x' || getAddress(deployedToken) !== token)
  throw new Error(
    'Deployed bytecode or immutable MUSD token validation failed.',
  );
const source = await readFile('contracts/src/RunwayPayments.sol');
const record = {
  address,
  chainId: 31611,
  transactionHash,
  deploymentBlock: receipt.blockNumber.toString(),
  deployer: founder,
  musd: token,
  verifiedAt: new Date().toISOString(),
  verificationBlock: block.toString(),
  verification:
    'Successful founder creation; exact local creation bytecode and constructor arguments; deployed code and immutable MUSD verified through RPC. Explorer source verification not yet performed.',
  compiler: { version: '0.8.28', evmVersion: 'london', optimizerRuns: 200 },
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  creationBytecodeHash: keccak256(artifact.bytecode.object),
  deployedBytecodeHash: keccak256(code),
  artifact: 'contracts/out/RunwayPayments.sol/RunwayPayments.json',
  scheduleCountAtVerification: count.toString(),
  outstandingObligationsAtVerification: obligations.toString(),
};
// Configuration changes happen only after every chain/build check passes.
await writeFile(
  'deployments/mezo-testnet.payments.json',
  JSON.stringify(record, null, 2) + '\n',
);
manifest.contracts.payments = {
  address,
  status:
    'RPC and local creation bytecode verified; see mezo-testnet.payments.json',
  record: 'deployments/mezo-testnet.payments.json',
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
let env = await readFile('.env', 'utf8');
const value = `VITE_PAYMENT_CONTRACT_ADDRESS=${address}`;
env = /^VITE_PAYMENT_CONTRACT_ADDRESS=.*$/m.test(env)
  ? env.replace(/^VITE_PAYMENT_CONTRACT_ADDRESS=.*$/m, value)
  : env + '\n' + value + '\n';
await writeFile('.env', env);
console.log(JSON.stringify(record, null, 2));
