import { formatUnits } from 'viem';
export function errorText(error: unknown) {
  return error instanceof Error
    ? error.message.split('\n')[0]
    : 'Request failed. Please try again.';
}
export function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
export const amount = (value: bigint, decimals = 18) =>
  formatUnits(value, decimals);
