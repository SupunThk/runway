import { readFile, writeFile } from 'node:fs/promises';
import {
  createPublicClient,
  erc20Abi,
  http,
  isAddress,
  getAddress,
  parseAbi,
} from 'viem';

const manifestPath = new URL(
  '../deployments/mezo-testnet.dependencies.json',
  import.meta.url,
);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const rpc = process.env.VITE_MEZO_TESTNET_RPC || manifest.rpc;
const client = createPublicClient({
  transport: http(rpc, { timeout: 15000, retryCount: 1 }),
});
const report = {
  checkedAt: new Date().toISOString(),
  rpc,
  checks: {},
  complete: false,
};
try {
  const chainId = await client.getChainId();
  if (chainId !== 31611)
    throw new Error(`Wrong chain: ${chainId}; expected testnet 31611`);
  report.checks.chainId = chainId;
  const block = await client.getBlockNumber();
  report.checks.block = block.toString();
  const address =
    process.env.VITE_MUSD_ADDRESS || manifest.contracts.musd.address;
  if (!isAddress(address)) throw new Error('MUSD address missing or invalid');
  const code = await client.getCode({ address, blockNumber: block });
  if (!code || code === '0x')
    throw new Error('No MUSD bytecode at configured address');
  const read = (functionName) =>
    client.readContract({
      address,
      abi: erc20Abi,
      functionName,
      blockNumber: block,
    });
  const [name, symbol, decimals] = await Promise.all([
    read('name'),
    read('symbol'),
    read('decimals'),
  ]);
  if (symbol !== 'MUSD') throw new Error(`Unexpected token symbol ${symbol}`);
  report.checks.musd = {
    address,
    name,
    symbol,
    decimals,
    bytecodeBytes: (code.length - 2) / 2,
  };
  for (const role of ['FOUNDER', 'CONTRACTOR']) {
    const wallet = process.env[`${role}_ADDRESS`];
    if (!wallet) {
      report.checks[role.toLowerCase()] = {
        status: 'wallet address not provided',
      };
      continue;
    }
    if (!isAddress(wallet)) throw new Error(`Invalid ${role} address`);
    const [btc, musd] = await Promise.all([
      client.getBalance({ address: wallet, blockNumber: block }),
      client.readContract({
        address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [wallet],
        blockNumber: block,
      }),
    ]);
    report.checks[role.toLowerCase()] = {
      address: wallet,
      btcBaseUnits: btc.toString(),
      musdBaseUnits: musd.toString(),
    };
  }
  report.checks.borrowing = {
    status: 'pending ABI and deployed-contract verification',
  };
  const payments =
    process.env.VITE_PAYMENT_CONTRACT_ADDRESS ||
    manifest.contracts.payments.address;
  if (payments) {
    if (!isAddress(payments)) throw new Error('Payment address is invalid');
    const [paymentCode, configuredToken] = await Promise.all([
      client.getCode({ address: payments, blockNumber: block }),
      client.readContract({
        address: payments,
        abi: parseAbi(['function musd() view returns (address)']),
        functionName: 'musd',
        blockNumber: block,
      }),
    ]);
    if (
      !paymentCode ||
      paymentCode === '0x' ||
      getAddress(configuredToken) !== getAddress(address)
    )
      throw new Error('Payment deployment validation failed');
    report.checks.payments = {
      address: payments,
      musd: configuredToken,
      status: 'deployed bytecode and immutable MUSD verified',
    };
  }
  report.checks.paymentTransactions = {
    status: payments
      ? 'deployment verified; schedule creation, claim and cancellation receipts pending'
      : 'pending payment deployment and confirmed payment receipts',
  };
  report.complete = false;
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.error = error.shortMessage || error.message;
  console.error(report.error);
  process.exitCode = 1;
}
await writeFile(
  new URL('../deployments/integration-check.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
