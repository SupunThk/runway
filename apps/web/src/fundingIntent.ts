import {
  erc20Abi,
  isAddress,
  isHash,
  parseEventLogs,
  parseUnits,
  zeroAddress,
  zeroHash,
  type Address,
  type Hash,
  type PublicClient,
} from 'viem';
import { optionalAddress, paymentsAbi, TESTNET_CHAIN_ID } from '@runway/mezo';
import { paymentDurationMinutes } from './paymentOptions';
const paymentAddress = optionalAddress(
  import.meta.env.VITE_PAYMENT_CONTRACT_ADDRESS,
);

export type IntentStep = 'loan' | 'approval' | 'funding';
export type IntentEvidence = {
  hash: Hash;
  target: Address;
  data: `0x${string}`;
  value: string;
  submittedAt: string;
  state: 'submitted' | 'confirmed' | 'reverted';
  blockNumber?: string;
  scheduleId?: string;
};
export type FundingIntent = {
  version: 1;
  id: string;
  owner: Address;
  chainId: number;
  contract: Address;
  recipient: Address;
  amountBaseUnits: string;
  paymentType: 'schedule' | 'one-time';
  durationMinutes: number;
  reference: Hash;
  workspaceId?: string;
  invoiceId?: string;
  createdAt: string;
  evidence: Partial<Record<IntentStep, IntentEvidence>>;
  reviewedLoan?: {
    proceeds: string;
    debtBefore: string;
    debtAfter: string;
    fee: string;
    collateralAfter: string;
    sourceBlock: string;
  };
  confirmedLoan?: {
    debt: string;
    collateral: string;
    walletMusd: string;
    sourceBlock: string;
    observedAt: string;
  };
};
const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const amount = (v: unknown) =>
  typeof v === 'string' &&
  /^\d{1,78}$/.test(v) &&
  BigInt(v) <= (1n << 256n) - 1n;
export const intentKey = (owner: Address) =>
  `runway:funding-intents:v1:${TESTNET_CHAIN_ID}:${paymentAddress?.toLowerCase()}:${owner.toLowerCase()}`;
export function readFundingIntents(owner: Address): FundingIntent[] {
  const raw = localStorage.getItem(intentKey(owner));
  if (!raw) return [];
  try {
    const rows: FundingIntent[] = JSON.parse(raw);
    if (
      !Array.isArray(rows) ||
      rows.length > 20 ||
      new Set(rows.map((r) => r.id)).size !== rows.length
    )
      throw new Error();
    for (const row of rows) {
      if (
        !paymentAddress ||
        row.version !== 1 ||
        !idPattern.test(row.id) ||
        row.chainId !== TESTNET_CHAIN_ID ||
        row.owner?.toLowerCase() !== owner.toLowerCase() ||
        !isAddress(row.contract ?? '') ||
        row.contract?.toLowerCase() !== paymentAddress?.toLowerCase() ||
        !isAddress(row.recipient ?? '') ||
        row.recipient.toLowerCase() === zeroAddress ||
        row.recipient.toLowerCase() === paymentAddress?.toLowerCase() ||
        !amount(row.amountBaseUnits) ||
        BigInt(row.amountBaseUnits) === 0n ||
        !isHash(row.reference ?? '') ||
        !['schedule', 'one-time'].includes(row.paymentType) ||
        !Number.isInteger(row.durationMinutes) ||
        (row.paymentType === 'schedule'
          ? row.durationMinutes < 1 || row.durationMinutes > 525600
          : row.durationMinutes !== 0) ||
        !Number.isFinite(Date.parse(row.createdAt)) ||
        !row.evidence ||
        typeof row.evidence !== 'object' ||
        Array.isArray(row.evidence) ||
        [row.workspaceId, row.invoiceId].some(
          (v) => v !== undefined && !idPattern.test(v),
        )
      )
        throw new Error();
      for (const [step, e] of Object.entries(row.evidence)) {
        if (
          !['loan', 'approval', 'funding'].includes(step) ||
          !e ||
          !isHash(e.hash ?? '') ||
          !isAddress(e.target ?? '') ||
          !/^0x(?:[a-fA-F0-9]{2})+$/.test(e.data ?? '') ||
          !amount(e.value) ||
          !['submitted', 'confirmed', 'reverted'].includes(e.state) ||
          !Number.isFinite(Date.parse(e.submittedAt)) ||
          (e.blockNumber !== undefined && !amount(e.blockNumber))
        )
          throw new Error();
        if (
          e.scheduleId !== undefined &&
          (!amount(e.scheduleId) || BigInt(e.scheduleId) === 0n)
        )
          throw new Error();
      }
      if (
        new Set(Object.values(row.evidence).map((e) => e.hash)).size !==
        Object.keys(row.evidence).length
      )
        throw new Error();
      if (row.reviewedLoan) {
        const r = row.reviewedLoan;
        if (
          ![
            r.proceeds,
            r.debtBefore,
            r.debtAfter,
            r.fee,
            r.collateralAfter,
            r.sourceBlock,
          ].every(amount)
        )
          throw new Error();
      }
      if (row.confirmedLoan) {
        const o = row.confirmedLoan;
        if (
          ![o.debt, o.collateral, o.walletMusd, o.sourceBlock].every(amount) ||
          !Number.isFinite(Date.parse(o.observedAt))
        )
          throw new Error();
      }
    }
    return rows;
  } catch {
    throw new Error(
      'Saved funding plans could not be read. Check your wallet and transaction receipts before starting another payment.',
    );
  }
}
export function findFundingIntent(owner: Address, id: string) {
  const row = readFundingIntents(owner).find((r) => r.id === id);
  if (!row)
    throw new Error(
      'This funding plan is not saved for the connected wallet. Reconnect its owner in this browser.',
    );
  return row;
}
function write(owner: Address, rows: FundingIntent[]) {
  localStorage.setItem(intentKey(owner), JSON.stringify(rows));
  window.dispatchEvent(new Event('runway-funding-intent'));
}
export function createFundingIntent(owner: Address, form: HTMLFormElement) {
  if (!paymentAddress) throw new Error('Payment deployment is unavailable.');
  const input = new FormData(form);
  const recipient = String(input.get('recipient'));
  const text = String(input.get('total'));
  if (
    !isAddress(recipient) ||
    recipient.toLowerCase() === zeroAddress ||
    recipient.toLowerCase() === paymentAddress.toLowerCase()
  )
    throw new Error('Enter a valid recipient address.');
  if (!/^\d{1,60}(\.\d{1,18})?$/.test(text))
    throw new Error(
      'Enter a positive MUSD amount with up to 18 decimal places.',
    );
  const units = parseUnits(text, 18);
  if (units <= 0n || units > (1n << 256n) - 1n)
    throw new Error('Funding amount is outside the supported range.');
  const params = new URLSearchParams(location.search);
  const reference = params.get('reference') ?? zeroHash;
  if (!isHash(reference))
    throw new Error(
      'Invalid invoice reference. Reopen this invoice from Workspace.',
    );
  const paymentType = String(input.get('paymentType') ?? 'schedule');
  if (paymentType !== 'schedule' && paymentType !== 'one-time')
    throw new Error('Choose a payment type.');
  const row: FundingIntent = {
    version: 1,
    id: crypto.randomUUID(),
    owner,
    chainId: TESTNET_CHAIN_ID,
    contract: paymentAddress,
    recipient,
    amountBaseUnits: units.toString(),
    paymentType,
    durationMinutes:
      paymentType === 'schedule'
        ? paymentDurationMinutes(
            String(input.get('duration')),
            String(input.get('durationUnit') ?? 'days'),
          )
        : 0,
    reference,
    ...(params.get('workspaceId')
      ? { workspaceId: params.get('workspaceId')! }
      : {}),
    ...(params.get('invoiceId') ? { invoiceId: params.get('invoiceId')! } : {}),
    createdAt: new Date().toISOString(),
    evidence: {},
  };
  if (
    [row.workspaceId, row.invoiceId].some(
      (v) => v !== undefined && !idPattern.test(v),
    )
  )
    throw new Error('Invalid invoice identifiers.');
  const rows = readFundingIntents(owner);
  if (rows.length >= 20)
    throw new Error(
      'This browser already holds 20 funding plans. Retain their receipts before clearing browser data.',
    );
  write(owner, [...rows, row]);
  return row;
}
export function saveIntentEvidence(
  owner: Address,
  id: string,
  step: IntentStep,
  evidence: IntentEvidence,
  reviewedLoan?: FundingIntent['reviewedLoan'],
  replacesHash?: Hash,
) {
  const rows = readFundingIntents(owner);
  const row = rows.find((r) => r.id === id);
  if (!row)
    throw new Error(
      'Funding plan is missing. Keep the transaction hash before closing.',
    );
  const previous = row.evidence[step];
  if (
    previous &&
    previous.hash !== evidence.hash &&
    previous.state !== 'reverted' &&
    previous.hash !== replacesHash
  )
    throw new Error(
      'This step already has a transaction. Check its receipt before submitting again.',
    );
  row.evidence[step] = evidence;
  if (reviewedLoan) row.reviewedLoan = reviewedLoan;
  write(owner, rows);
}
export function fundingDestination(row: FundingIntent) {
  const params = new URLSearchParams({
    create: '1',
    intent: row.id,
    recipient: row.recipient,
    paymentType: row.paymentType,
    durationMinutes: String(row.durationMinutes),
    reference: row.reference,
  });
  // Keep all 18 decimal places; Number is never used for financial terms.
  const n = BigInt(row.amountBaseUnits);
  params.set(
    'amount',
    `${n / 10n ** 18n}.${(n % 10n ** 18n).toString().padStart(18, '0')}`,
  );
  if (row.workspaceId) params.set('workspaceId', row.workspaceId);
  if (row.invoiceId) params.set('invoiceId', row.invoiceId);
  return `/?${params}`;
}
export function saveConfirmedLoan(
  owner: Address,
  id: string,
  observation: NonNullable<FundingIntent['confirmedLoan']>,
) {
  const rows = readFundingIntents(owner),
    row = rows.find((r) => r.id === id);
  if (!row)
    throw new Error('The funding plan is missing. Keep the loan receipt.');
  row.confirmedLoan = observation;
  write(owner, rows);
}
export async function inspectIntentEvidence(
  client: PublicClient,
  row: FundingIntent,
  evidence: IntentEvidence,
) {
  if ((await client.getChainId()) !== TESTNET_CHAIN_ID)
    throw new Error('Wrong RPC network.');
  const receipt = await client.getTransactionReceipt({ hash: evidence.hash });
  const tx = await client.getTransaction({ hash: evidence.hash });
  if (
    tx.from.toLowerCase() !== row.owner.toLowerCase() ||
    tx.to?.toLowerCase() !== evidence.target.toLowerCase() ||
    tx.input.toLowerCase() !== evidence.data.toLowerCase() ||
    tx.value !== BigInt(evidence.value)
  )
    throw new Error('Saved transaction does not match its reviewed action.');
  const [block, head] = await Promise.all([
    client.getBlock({ blockNumber: receipt.blockNumber }),
    client.getBlockNumber({ cacheTime: 0 }),
  ]);
  const tip = await client.getBlock({ blockNumber: head });
  const age = Date.now() / 1000 - Number(tip.timestamp);
  if (age > 120 || age < -30)
    throw new Error('Chain head is stale. Refresh before continuing.');
  if (block.hash !== receipt.blockHash || head < receipt.blockNumber + 12n)
    return { state: 'submitted' as const };
  let scheduleId: string | undefined;
  if (
    receipt.status === 'success' &&
    evidence.target.toLowerCase() === row.contract.toLowerCase()
  ) {
    const event = parseEventLogs({
      abi: paymentsAbi,
      eventName: 'ScheduleCreated',
      logs: receipt.logs.filter(
        (log) => log.address.toLowerCase() === row.contract.toLowerCase(),
      ),
    }).find(
      (log) =>
        log.args.sender.toLowerCase() === row.owner.toLowerCase() &&
        log.args.recipient.toLowerCase() === row.recipient.toLowerCase() &&
        log.args.total.toString() === row.amountBaseUnits &&
        log.args.end - log.args.start === BigInt(row.durationMinutes) * 60n &&
        log.args.referenceHash.toLowerCase() === row.reference.toLowerCase(),
    );
    if (!event)
      throw new Error(
        'The funding receipt does not contain this plan’s exact schedule terms.',
      );
    scheduleId = event.args.scheduleId.toString();
  }
  if (
    receipt.status === 'success' &&
    row.paymentType === 'one-time' &&
    row.evidence.funding?.hash === evidence.hash
  ) {
    const event = parseEventLogs({
      abi: erc20Abi,
      eventName: 'Transfer',
      logs: receipt.logs.filter(
        (log) => log.address.toLowerCase() === evidence.target.toLowerCase(),
      ),
    }).find(
      (log) =>
        log.args.from.toLowerCase() === row.owner.toLowerCase() &&
        log.args.to.toLowerCase() === row.recipient.toLowerCase() &&
        log.args.value.toString() === row.amountBaseUnits,
    );
    if (!event)
      throw new Error(
        'The receipt does not contain this plan’s exact MUSD transfer.',
      );
  }
  return {
    state:
      receipt.status === 'success'
        ? ('confirmed' as const)
        : ('reverted' as const),
    blockNumber: receipt.blockNumber.toString(),
    ...(scheduleId ? { scheduleId } : {}),
  };
}
