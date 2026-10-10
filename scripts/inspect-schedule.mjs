import { readFile, writeFile } from 'node:fs/promises';
import { createPublicClient, erc20Abi, formatUnits, http } from 'viem';

const id = BigInt(process.argv[2] || '1');
if (id < 1n) throw new Error('Schedule ID must be positive.');
const deployment = JSON.parse(
  await readFile('deployments/mezo-testnet.payments.json', 'utf8'),
);
const artifact = JSON.parse(
  await readFile(
    'contracts/out/RunwayPayments.sol/RunwayPayments.json',
    'utf8',
  ),
);
const client = createPublicClient({
  transport: http('https://rpc.test.mezo.org', {
    timeout: 15000,
    retryCount: 1,
  }),
});
if ((await client.getChainId()) !== 31611)
  throw new Error('Expected Mezo testnet.');
const block = await client.getBlock();
const contract = {
  address: deployment.address,
  abi: artifact.abi,
  blockNumber: block.number,
};
const [schedule, claimable] = await Promise.all([
  client.readContract({ ...contract, functionName: 'getSchedule', args: [id] }),
  client.readContract({ ...contract, functionName: 'claimable', args: [id] }),
]);
const [recipientBalance, contractBalance] = await Promise.all([
  client.readContract({
    address: deployment.musd,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [schedule.recipient],
    blockNumber: block.number,
  }),
  client.readContract({
    address: deployment.musd,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [deployment.address],
    blockNumber: block.number,
  }),
]);
// Bounded inspection window; old deployments need a dedicated history scan.
const firstBlock = BigInt(deployment.deploymentBlock);
const fromBlock =
  block.number - firstBlock > 9999n ? block.number - 9999n : firstBlock;
const events = [];
for (let from = fromBlock; from <= block.number; from += 1000n) {
  const to = from + 999n < block.number ? from + 999n : block.number;
  const logs = await client.getContractEvents({
    address: deployment.address,
    abi: artifact.abi,
    args: { scheduleId: id },
    fromBlock: from,
    toBlock: to,
    strict: true,
  });
  for (const log of logs)
    if (log.args.scheduleId === id)
      events.push({
        event: log.eventName,
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
        args: log.args,
      });
}
const time = (value) => new Date(Number(value) * 1000).toISOString();
const report = {
  checkedAt: new Date().toISOString(),
  chainId: 31611,
  block: block.number,
  chainTime: time(block.timestamp),
  contract: deployment.address,
  scheduleId: id,
  schedule,
  startUTC: time(schedule.start),
  endUTC: time(schedule.end),
  totalMUSD: formatUnits(schedule.total, 18),
  claimedMUSD: formatUnits(schedule.claimed, 18),
  claimableMUSD: formatUnits(claimable, 18),
  recipientBalanceMUSD: formatUnits(recipientBalance, 18),
  contractBalanceMUSD: formatUnits(contractBalance, 18),
  historyFromBlock: fromBlock,
  historyComplete: fromBlock === firstBlock,
  events,
};
const output = JSON.stringify(
  report,
  (_, value) => (typeof value === 'bigint' ? value.toString() : value),
  2,
);
await writeFile(`deployments/schedule-${id}.check.json`, output + '\n');
console.log(output);
