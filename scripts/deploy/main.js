import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  encodeDeployData,
  formatEther,
  getAddress,
  http,
  keccak256,
  parseAbi,
} from 'viem';
import artifact from '../../contracts/out/RunwayPayments.sol/RunwayPayments.json';

const founder = getAddress(__FOUNDER__);
const token = getAddress(__MUSD__);
const chain = defineChain({
  id: 31611,
  name: 'Mezo Testnet',
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.test.mezo.org'] } },
});
const client = createPublicClient({
  chain,
  transport: http(chain.rpcUrls.default.http[0]),
});
const bytecode = artifact.bytecode.object;
const data = encodeDeployData({ abi: artifact.abi, bytecode, args: [token] });
const wallets = new Map();
const select = document.querySelector('#wallet');
const connectButton = document.querySelector('#connect');
const deployButton = document.querySelector('#deploy');
const status = document.querySelector('#status');
let selected;
let wallet;
let account;
let pending = false;
let deployed = false;
document.querySelector('#founder').textContent = founder;
document.querySelector('#musd').textContent = token;
document.querySelector('#bytecode-hash').textContent = keccak256(bytecode);

function invalidate() {
  wallet = undefined;
  account = undefined;
  deployButton.disabled = true;
}
function renderWallets() {
  const oldValue = select.value;
  select.replaceChildren();
  const seen = new Set();
  for (const [id, item] of wallets) {
    if (seen.has(item.provider)) continue;
    seen.add(item.provider);
    const option = document.createElement('option');
    option.value = id;
    option.textContent = item.name;
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === oldValue))
    select.value = oldValue;
  if (!select.options.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No wallet detected';
    select.append(option);
  }
}
window.addEventListener('eip6963:announceProvider', (event) => {
  const { info, provider } = event.detail;
  wallets.set(info.uuid, { name: info.name, provider });
  renderWallets();
});
window.dispatchEvent(new Event('eip6963:requestProvider'));
// Also accept older browser wallets that only inject window.ethereum.
function addLegacyWallet() {
  if (window.ethereum)
    wallets.set('legacy', {
      name: window.ethereum.isBraveWallet ? 'Brave Wallet' : 'Browser wallet',
      provider: window.ethereum,
    });
  renderWallets();
}
addLegacyWallet();
window.addEventListener('ethereum#initialized', addLegacyWallet);
select.addEventListener('change', () => {
  invalidate();
  status.textContent = 'Wallet changed. Connect and check again.';
});

async function validate() {
  if (!selected)
    throw new Error(
      'No wallet selected. Unlock Brave Wallet and refresh this page.',
    );
  const accounts = await selected.request({ method: 'eth_accounts' });
  if (!accounts[0] || getAddress(accounts[0]) !== founder)
    throw new Error(
      'Select the founder account in your wallet, then reconnect.',
    );
  if (Number(await selected.request({ method: 'eth_chainId' })) !== chain.id)
    throw new Error(
      'Switch your wallet to Mezo Testnet (31611), then reconnect.',
    );
  if ((await client.getChainId()) !== chain.id)
    throw new Error('RPC network mismatch. Deployment stopped.');
  const code = await client.getCode({ address: token });
  if (!code || code === '0x')
    throw new Error('Official MUSD contract is unavailable.');
  return accounts[0];
}

connectButton.addEventListener('click', async () => {
  if (pending || deployed) return;
  invalidate();
  connectButton.disabled = true;
  try {
    selected = wallets.get(select.value)?.provider;
    if (!selected)
      throw new Error('No wallet detected. Unlock Brave Wallet and refresh.');
    await selected.request({ method: 'eth_requestAccounts' });
    account = await validate();
    wallet = createWalletClient({ chain, transport: custom(selected) });
    selected.on?.('accountsChanged', invalidate);
    selected.on?.('chainChanged', invalidate);
    const [gas, gasPrice, balance] = await Promise.all([
      client.estimateGas({ account, data }),
      client.getGasPrice(),
      client.getBalance({ address: account }),
    ]);
    const estimate = gas * gasPrice;
    if (balance < estimate)
      throw new Error('Insufficient test BTC for estimated deployment gas.');
    status.textContent = `Founder and network verified.\nEstimated gas: ${gas}\nEstimated fee at current gas price: ${formatEther(estimate)} BTC\nReview the final fee in your wallet before approving.`;
    deployButton.disabled = false;
  } catch (error) {
    invalidate();
    status.textContent = error.shortMessage || error.message;
  } finally {
    connectButton.disabled = false;
  }
});

deployButton.addEventListener('click', async () => {
  if (!wallet || pending || deployed) return;
  pending = true;
  deployButton.disabled = true;
  connectButton.disabled = true;
  select.disabled = true;
  let hash;
  try {
    const currentAccount = await validate();
    status.textContent =
      'Review and approve the contract deployment in your wallet.';
    hash = await wallet.deployContract({
      account: currentAccount,
      chain,
      abi: artifact.abi,
      bytecode,
      args: [token],
    });
    status.textContent = `Deployment submitted: ${hash}\nWaiting for confirmation. Do not deploy again.`;
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success' || !receipt.contractAddress)
      throw new Error('Deployment reverted.');
    const deployedToken = await client.readContract({
      address: receipt.contractAddress,
      abi: parseAbi(['function musd() view returns (address)']),
      functionName: 'musd',
    });
    if (getAddress(deployedToken) !== token)
      throw new Error('Deployed token verification failed.');
    deployed = true;
    status.textContent = `Deployment confirmed and MUSD configuration verified.\nContract: ${receipt.contractAddress}\nTransaction: ${hash}`;
    const link = document.createElement('a');
    link.href = `https://explorer.test.mezo.org/tx/${hash}`;
    link.textContent = 'View confirmed deployment in explorer ↗';
    link.target = '_blank';
    link.rel = 'noreferrer';
    document.querySelector('#result').replaceChildren(link);
  } catch (error) {
    status.textContent = `${error.shortMessage || error.message}${hash ? `\nSubmitted transaction: ${hash}\nCheck its explorer status before attempting another deployment.` : ''}`;
  } finally {
    pending = false;
    // Once broadcast, keep deployment disabled even if confirmation polling fails.
    connectButton.disabled = Boolean(hash) || deployed;
    select.disabled = Boolean(hash) || deployed;
    deployButton.disabled = true;
  }
});
