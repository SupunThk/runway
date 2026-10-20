import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import {
  mezoTestnet,
  optionalAddress,
  DEFAULT_RPC,
  DEFAULT_EXPLORER,
  MEZO_TESTNET_TOKEN,
} from '@runway/mezo';

export const musdAddress = optionalAddress(import.meta.env.VITE_MUSD_ADDRESS);
export const mezoTokenAddress =
  optionalAddress(import.meta.env.VITE_MEZO_TOKEN_ADDRESS) ??
  MEZO_TESTNET_TOKEN;
export const paymentAddress = optionalAddress(
  import.meta.env.VITE_PAYMENT_CONTRACT_ADDRESS,
);
const rpc = import.meta.env.VITE_MEZO_TESTNET_RPC || DEFAULT_RPC;
export const explorer = (
  import.meta.env.VITE_TESTNET_EXPLORER || DEFAULT_EXPLORER
).replace(/\/$/, '');
export const chainConfigValid =
  !import.meta.env.VITE_MEZO_TESTNET_CHAIN_ID ||
  import.meta.env.VITE_MEZO_TESTNET_CHAIN_ID === '31611';
export const config = createConfig({
  chains: [mezoTestnet],
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected({ target: { id: 'rabby', name: 'Rabby', provider: 'isRabby' } }),
    injected({ target: 'metaMask' }),
    injected(),
  ],
  transports: {
    [mezoTestnet.id]: http(rpc, { timeout: 15000, retryCount: 1 }),
  },
});
