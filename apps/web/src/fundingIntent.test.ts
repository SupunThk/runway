import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { zeroHash, type Address, type Hash, type PublicClient } from 'viem';
import type { FundingIntent, IntentEvidence } from './fundingIntent';
import { borrowingWriteDeployment } from '@runway/mezo';
const owner = '0x0000000000000000000000000000000000000011' as Address,
  contract = '0x0000000000000000000000000000000000000033' as Address;
const recipient = '0x0000000000000000000000000000000000000022' as Address;
let module: typeof import('./fundingIntent');
let storage: Map<string, string>;
beforeAll(async () => {
  vi.stubEnv('VITE_PAYMENT_CONTRACT_ADDRESS', contract);
  vi.resetModules();
  module = await import('./fundingIntent');
});
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal('window', { dispatchEvent() {} });
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const row = (): FundingIntent => ({
  version: 1,
  id: '00000000-0000-4000-8000-000000000001',
  owner,
  contract,
  chainId: 31611,
  recipient,
  amountBaseUnits: '100000000000000000100000000000000001',
  paymentType: 'schedule',
  durationMinutes: 1440,
  reference: zeroHash,
  createdAt: new Date().toISOString(),
  evidence: {},
});
const evidence = (): IntentEvidence => ({
  hash: zeroHash,
  target: borrowingWriteDeployment.operations.address,
  data: '0x1234',
  value: '0',
  state: 'submitted',
  submittedAt: new Date().toISOString(),
});
describe('saved borrow-and-fund intent recovery', () => {
  it('retains exact payment terms beyond floating-point precision and scopes reads to an owner', () => {
    const saved = row();
    storage.set(module.intentKey(owner), JSON.stringify([saved]));
    const params = new URL(module.fundingDestination(saved), 'http://localhost')
      .searchParams;
    expect(params.get('amount')).toBe('100000000000000000.100000000000000001');
    expect(params.get('recipient')).toBe(recipient);
    expect(params.get('durationMinutes')).toBe('1440');
    expect(module.readFundingIntents(recipient)).toEqual([]);
    storage.set(module.intentKey(recipient), JSON.stringify([saved]));
    expect(() => module.readFundingIntents(recipient)).toThrow(
      'could not be read',
    );
  });
  it('fails closed for corrupted storage and does not overwrite an unresolved transaction', () => {
    storage.set(module.intentKey(owner), 'broken');
    expect(() => module.readFundingIntents(owner)).toThrow('could not be read');
    const saved = row();
    storage.set(module.intentKey(owner), JSON.stringify([saved]));
    module.saveIntentEvidence(owner, saved.id, 'loan', evidence());
    expect(() =>
      module.saveIntentEvidence(owner, saved.id, 'loan', {
        ...evidence(),
        hash: `0x${'11'.repeat(32)}`,
      }),
    ).toThrow('already has');
    expect(module.findFundingIntent(owner, saved.id).evidence.loan?.hash).toBe(
      zeroHash,
    );
  });
  it('requires matching calldata, canonical receipt, fresh head and twelve blocks before resuming', async () => {
    const saved = row(),
      e = evidence(),
      now = BigInt(Math.floor(Date.now() / 1000));
    let head = 111n,
      value = 0n,
      hash: Hash = zeroHash;
    const client = {
      getChainId: async () => 31611,
      getTransactionReceipt: async () => ({
        blockNumber: 100n,
        blockHash: zeroHash,
        status: 'success',
        logs: [],
      }),
      getTransaction: async () => ({
        from: owner,
        to: e.target,
        input: e.data,
        value,
      }),
      getBlockNumber: async () => head,
      getBlock: async () => ({ hash, timestamp: now }),
    } as unknown as PublicClient;
    expect((await module.inspectIntentEvidence(client, saved, e)).state).toBe(
      'submitted',
    );
    head = 112n;
    expect((await module.inspectIntentEvidence(client, saved, e)).state).toBe(
      'confirmed',
    );
    hash = `0x${'11'.repeat(32)}`;
    expect((await module.inspectIntentEvidence(client, saved, e)).state).toBe(
      'submitted',
    );
    value = 1n;
    await expect(
      module.inspectIntentEvidence(client, saved, e),
    ).rejects.toThrow('does not match');
  });
});
