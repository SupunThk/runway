import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { TransactionReceiptNotFoundError, type Hash } from 'viem';
import {
  assertLoanFresh,
  mezoTestnet,
  prepareLoanAction,
  readLoanSnapshot,
  TESTNET_CHAIN_ID,
  type LoanInput,
  type LoanSnapshot,
} from '@runway/mezo';
import { musdAddress, paymentAddress } from '../config';
import { errorText } from '../format';
import { pendingKey } from '../pending';
import {
  findFundingIntent,
  inspectIntentEvidence,
  saveConfirmedLoan,
  saveIntentEvidence,
} from '../fundingIntent';
import {
  inspectLoanTransaction,
  loanPendingKey,
  readPendingLoan,
  withWalletLock,
  type PendingLoan,
} from '../loanPending';

type Review = Awaited<ReturnType<typeof prepareLoanAction>> & {
  snapshot: LoanSnapshot;
  input: LoanInput;
  maxDebt: bigint;
};
export function useLoanActions() {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: TESTNET_CHAIN_ID });
  const { data: wallet } = useWalletClient();
  const cache = useQueryClient();
  const [review, setReview] = useState<Review>();
  const [pending, setPending] = useState<PendingLoan>();
  const [notice, setNotice] = useState('');
  const [storageError, setStorageError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [now, setNow] = useState(Date.now);
  const fundingIntentId =
    new URLSearchParams(location.search).get('intent') ?? undefined;
  async function checkFundingIntent(input: LoanInput) {
    if (
      !fundingIntentId ||
      !address ||
      !['open', 'borrow'].includes(input.operation)
    )
      return;
    const intent = findFundingIntent(address, fundingIntentId);
    if (intent.evidence.funding)
      throw new Error(
        'This plan already has a payment transaction. Check its receipt before borrowing again.',
      );
    if (
      intent.evidence.loan &&
      (await inspectIntentEvidence(client!, intent, intent.evidence.loan))
        .state !== 'reverted'
    )
      throw new Error(
        'This payment plan already has a loan transaction. Resume funding without borrowing again.',
      );
  }
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    function reload() {
      try {
        setPending(address ? readPendingLoan(address) : undefined);
        setStorageError('');
      } catch (error) {
        setStorageError(errorText(error));
      }
    }
    reload();
    window.addEventListener('storage', reload);
    return () => window.removeEventListener('storage', reload);
  }, [address]);
  const query = useQuery({
    queryKey: ['loan-actions', address, chainId, musdAddress],
    enabled: Boolean(
      address && client && musdAddress && chainId === TESTNET_CHAIN_ID,
    ),
    queryFn: () => readLoanSnapshot(client!, address!, musdAddress!),
    retry: false,
    refetchInterval: 30_000,
  });
  const status = useQuery({
    queryKey: ['loan-transaction', pending?.hash],
    enabled: Boolean(pending && client),
    queryFn: async () => {
      try {
        return await inspectLoanTransaction(client!, pending!);
      } catch (error) {
        if (error instanceof TransactionReceiptNotFoundError)
          return { state: 'pending' as const };
        throw error;
      }
    },
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.state === 'confirmed' || q.state.data?.state === 'reverted'
        ? false
        : 10_000,
  });
  const stale = Boolean(
    query.data &&
    (now / 1000 - Number(query.data.chainTime) > 60 ||
      now / 1000 - Number(query.data.chainTime) < -30),
  );
  const reviewStale = Boolean(
    review && now / 1000 - Number(review.snapshot.chainTime) > 60,
  );
  function checkStorage() {
    if (!address) throw new Error('Connect your wallet first.');
    if (
      readPendingLoan(address) ||
      (paymentAddress && localStorage.getItem(pendingKey(paymentAddress)))
    )
      throw new Error('Resolve the saved transaction before sending another.');
    const key = loanPendingKey(address) + ':probe';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
  }
  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice('');
    try {
      if (!client || !address || chainId !== TESTNET_CHAIN_ID || !musdAddress)
        throw new Error('Connect to Mezo testnet first.');
      await withWalletLock(address, action);
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function prepare(input: LoanInput) {
    setReview(undefined);
    await run(async () => {
      checkStorage();
      await checkFundingIntent(input);
      const snapshot = await readLoanSnapshot(client!, address!, musdAddress!);
      const prepared = await prepareLoanAction(client!, snapshot, input);
      cache.setQueryData(
        ['loan-actions', address, chainId, musdAddress],
        snapshot,
      );
      setReview({
        ...prepared,
        snapshot,
        input,
        maxDebt: prepared.quote.debt + 10n ** 16n,
      });
    });
  }
  async function submit() {
    const approved = review;
    if (!approved) return;
    await run(async () => {
      checkStorage();
      await checkFundingIntent(approved.input);
      assertLoanFresh(approved.snapshot);
      if (
        !wallet ||
        (await wallet.getChainId()) !== TESTNET_CHAIN_ID ||
        (await wallet.getAddresses())[0]?.toLowerCase() !==
          address!.toLowerCase()
      )
        throw new Error(
          'The selected wallet account or network changed. Review again.',
        );
      const snapshot = await readLoanSnapshot(client!, address!, musdAddress!);
      const fresh = await prepareLoanAction(client!, snapshot, approved.input);
      if (
        fresh.quote.recovery !== approved.quote.recovery ||
        snapshot.feeRate !== approved.snapshot.feeRate ||
        snapshot.feeExempt !== approved.snapshot.feeExempt ||
        snapshot.minNetDebt !== approved.snapshot.minNetDebt ||
        snapshot.gasReserve !== approved.snapshot.gasReserve ||
        snapshot.minimumRatio !== approved.snapshot.minimumRatio ||
        snapshot.criticalRatio !== approved.snapshot.criticalRatio ||
        snapshot.collateral !== approved.snapshot.collateral ||
        snapshot.rate !== approved.snapshot.rate ||
        (approved.input.operation === 'open' &&
          snapshot.openingRate !== approved.snapshot.openingRate) ||
        fresh.quote.debt > approved.maxDebt
      ) {
        setReview(undefined);
        throw new Error('Borrowing terms changed. Refresh and review again.');
      }
      checkStorage();
      if (
        (await wallet.getChainId()) !== TESTNET_CHAIN_ID ||
        (await wallet.getAddresses())[0]?.toLowerCase() !==
          address!.toLowerCase()
      )
        throw new Error(
          'Wallet account or network changed before signing. Review again.',
        );
      const hash = await wallet.sendTransaction({
        ...fresh.transaction,
        account: address!,
        chain: mezoTestnet,
        gas: (fresh.gas * 12n) / 10n,
      });
      const record: PendingLoan = {
        version: 1,
        chainId: TESTNET_CHAIN_ID,
        sender: address!,
        target: fresh.transaction.to,
        hash,
        data: fresh.transaction.data,
        value: fresh.transaction.value.toString(),
        operation: approved.input.operation,
        amount: approved.input.amount.toString(),
        debtBefore: snapshot.debt.toString(),
        collateralBefore: snapshot.collateral.toString(),
        submittedAt: new Date().toISOString(),
        ...(fundingIntentId &&
        ['open', 'borrow'].includes(approved.input.operation)
          ? { fundingIntentId }
          : {}),
      };
      setPending(record);
      setReview(undefined);
      try {
        localStorage.setItem(loanPendingKey(address!), JSON.stringify(record));
        if (record.fundingIntentId)
          saveIntentEvidence(
            address!,
            record.fundingIntentId,
            'loan',
            {
              hash,
              target: record.target,
              data: record.data,
              value: record.value,
              state: 'submitted',
              submittedAt: record.submittedAt,
            },
            {
              proceeds: record.amount,
              debtBefore: record.debtBefore,
              debtAfter: fresh.quote.debt.toString(),
              fee: fresh.quote.fee.toString(),
              collateralAfter: fresh.quote.collateral.toString(),
              sourceBlock: snapshot.blockNumber.toString(),
            },
          );
      } catch {
        setStorageError(
          `Transaction submitted, but storage failed. Keep this hash before closing: ${hash}`,
        );
      }
      setNotice(
        'Transaction submitted. Check the saved transaction; do not submit it again.',
      );
    });
  }
  async function acknowledge(hash: Hash) {
    if (
      !pending ||
      pending.hash !== hash ||
      !address ||
      !['confirmed', 'reverted'].includes(status.data?.state ?? '')
    )
      return false;
    try {
      if (pending.fundingIntentId) {
        const fresh = await inspectLoanTransaction(client!, pending);
        if (fresh.state !== 'confirmed' && fresh.state !== 'reverted')
          throw new Error(
            'Loan receipt is no longer final. Check again before funding.',
          );
        saveIntentEvidence(address, pending.fundingIntentId, 'loan', {
          hash: pending.hash,
          target: pending.target,
          data: pending.data,
          value: pending.value,
          submittedAt: pending.submittedAt,
          state: fresh.state,
          blockNumber: fresh.blockNumber.toString(),
        });
        if (fresh.state === 'confirmed') {
          const observed = await readLoanSnapshot(
            client!,
            address,
            musdAddress!,
          );
          saveConfirmedLoan(address, pending.fundingIntentId, {
            debt: observed.debt.toString(),
            collateral: observed.collateral.toString(),
            walletMusd: observed.walletMusd.toString(),
            sourceBlock: observed.blockNumber.toString(),
            observedAt: new Date(
              Number(observed.chainTime) * 1000,
            ).toISOString(),
          });
        }
      }
      if (readPendingLoan(address)?.hash === hash)
        localStorage.removeItem(loanPendingKey(address));
      setPending(undefined);
      setStorageError('');
      await cache.invalidateQueries({
        predicate: (q) =>
          ['loan-actions', 'borrowing', 'balances', 'schedules'].includes(
            String(q.queryKey[0]),
          ),
      });
      return true;
    } catch (error) {
      setNotice(errorText(error));
      return false;
    }
  }
  function removeTracking() {
    if (!address || busyRef.current) return;
    if (
      !window.confirm(
        'Removing local tracking does not cancel a blockchain transaction. Check the hash in your wallet and explorer first. Sending again can duplicate borrowing or repayment. Remove only this browser record?',
      )
    )
      return;
    try {
      localStorage.removeItem(loanPendingKey(address));
      setPending(undefined);
      setStorageError('');
      setReview(undefined);
      setNotice(
        'Local tracking removed. Any submitted transaction may still confirm.',
      );
    } catch (error) {
      setStorageError(errorText(error));
    }
  }
  return {
    address,
    chainId,
    query,
    status,
    review,
    pending,
    notice,
    storageError,
    busy,
    stale,
    reviewStale,
    prepare,
    submit,
    acknowledge,
    removeTracking,
    invalidateReview: () => setReview(undefined),
  };
}
