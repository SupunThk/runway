import {
  createPublicClient,
  http,
  parseAbi,
  hashMessage,
  type Address,
  type Hex,
} from 'viem';

export type ContractLoginProof = {
  address: Address;
  message: string;
  signature: Hex;
};
export type ContractSignatureVerifier = (
  proof: ContractLoginProof,
) => Promise<boolean>;
const client = createPublicClient({
  transport: http('https://rpc.test.mezo.org', {
    timeout: 8000,
    retryCount: 0,
  }),
});
const signatureAbi = parseAbi([
  'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)',
]);
// ERC-1271: https://eips.ethereum.org/EIPS/eip-1271. No counterfactual deployment or transaction execution.
export function contractSignatureVerifier(
  rpc = client,
): ContractSignatureVerifier {
  return async (proof) => {
    const [chain, head] = await Promise.all([rpc.getChainId(), rpc.getBlock()]);
    if (
      chain !== 31611 ||
      !head.hash ||
      head.number === null ||
      Math.abs(Date.now() / 1000 - Number(head.timestamp)) > 600
    )
      throw new Error('Contract-wallet chain verification unavailable.');
    const code = await rpc.getCode({
      address: proof.address,
      blockNumber: head.number,
    });
    if (!code || code === '0x') return false;
    const result = await rpc.readContract({
      address: proof.address,
      abi: signatureAbi,
      functionName: 'isValidSignature',
      args: [hashMessage(proof.message), proof.signature],
      blockNumber: head.number,
    });
    const canonical = await rpc.getBlock({ blockNumber: head.number });
    if (canonical.hash !== head.hash)
      throw new Error('Contract-wallet source block changed.');
    return result.toLowerCase() === '0x1626ba7e';
  };
}
