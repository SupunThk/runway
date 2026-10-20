import { useState } from 'react';
import type { usePublicClient, useWalletClient, Config } from 'wagmi';
import {
  erc20Abi,
  encodeFunctionData,
  getAddress,
  isAddress,
  parseEventLogs,
  parseUnits,
  zeroHash,
  type Hash,
  type Address,
} from 'viem';
import { paymentsAbi, TESTNET_CHAIN_ID } from '@runway/mezo';
import { musdAddress, paymentAddress } from '../config';
import { errorText } from '../format';
import type { usePendingTransaction, PendingTransaction } from '../pending';
import type { useDeploymentReadiness } from './useDeploymentReadiness';
import type { useBalances } from './useBalances';
import type { useSchedules } from './useSchedules';
export function usePaymentActions({
  client,
  wallet,
  address,
  chainId,
  readiness,
  recovery,
  balances,
  schedules,
  decimals,
  onCreated,
}: {
  client: ReturnType<typeof usePublicClient>;
  wallet: ReturnType<typeof useWalletClient<Config>>['data'];
  address?: Address;
  chainId?: number;
  readiness: ReturnType<typeof useDeploymentReadiness>;
  recovery: ReturnType<typeof usePendingTransaction>;
  balances: ReturnType<typeof useBalances>;
  schedules: ReturnType<typeof useSchedules>['query'];
  decimals: number;
  onCreated: () => void;
}) {
  const [notice, setNotice] = useState('');
  const [hash, setHash] = useState<Hash>();
  const [busy, setBusy] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const canTransact = Boolean(
    address &&
    chainId === TESTNET_CHAIN_ID &&
    wallet &&
    readiness.isSuccess &&
    readiness.data?.payments &&
    !recovery.pending &&
    !recovery.error &&
    !busy,
  );

  async function transaction(action: () => Promise<void>) {
    setBusy(true);
    setNotice('');
    setHash(undefined);
    try {
      if (!canTransact || !client || !wallet)
        throw new Error(
          'Connect to Mezo testnet and verify the payment deployment first.',
        );
      recovery.checkStorage();
      await action();
      setHistoryRevision((value) => value + 1);
      await Promise.all([balances.refetch(), schedules.refetch()]);
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function waitTracked(
    tx: Hash,
    action: PendingTransaction['action'],
    target: Address,
    data: `0x${string}`,
    id?: bigint,
  ) {
    let tracked: PendingTransaction = {
      version: 1,
      chainId: TESTNET_CHAIN_ID,
      contract: paymentAddress!,
      sender: address!,
      target,
      hash: tx,
      data,
      action,
      scheduleId: id?.toString(),
      submittedAt: new Date().toISOString(),
    };
    recovery.save(tracked);
    setHash(tx);
    let changedAction = false;
    const receipt = await client!.waitForTransactionReceipt({
      hash: tx,
      timeout: 120000,
      onReplaced: (replacement) => {
        changedAction = replacement.reason !== 'repriced';
        tracked = { ...tracked, hash: replacement.transaction.hash };
        recovery.save(tracked);
        setHash(tracked.hash);
      },
    });
    if (changedAction)
      throw new Error(
        'Transaction was replaced. Check the saved transaction before continuing.',
      );
    recovery.clear(tracked.hash);
    return receipt;
  }
  async function settle(id: bigint, cancel: boolean) {
    await transaction(async () => {
      const { request } = await client!.simulateContract({
        account: address!,
        address: paymentAddress!,
        abi: paymentsAbi,
        functionName: cancel ? 'cancel' : 'claim',
        args: [id],
      });
      const tx = await wallet!.writeContract(request);
      setHash(tx);
      setNotice('Transaction submitted. Waiting for confirmation…');
      const receipt = await waitTracked(
        tx,
        cancel ? 'Cancellation' : 'Claim',
        paymentAddress!,
        encodeFunctionData({
          abi: paymentsAbi,
          functionName: cancel ? 'cancel' : 'claim',
          args: [id],
        }),
        id,
      );
      if (receipt.status !== 'success')
        throw new Error('Transaction reverted. Refresh state before retrying.');
      setNotice(
        cancel
          ? 'Cancellation confirmed. Vested funds remain claimable.'
          : 'Claim confirmed. MUSD was sent to the stored recipient.',
      );
    });
  }
  async function create(form: HTMLFormElement) {
    const data = new FormData(form);
    await transaction(async () => {
      const recipient = String(data.get('recipient'));
      if (
        !isAddress(recipient) ||
        BigInt(recipient) === 0n ||
        getAddress(recipient) === paymentAddress
      )
        throw new Error('Enter a valid recipient address.');
      const text = String(data.get('total'));
      if (
        !/^\d+(\.\d+)?$/.test(text) ||
        (text.split('.')[1]?.length ?? 0) > decimals
      )
        throw new Error(`Use at most ${decimals} decimal places.`);
      const total = parseUnits(text, decimals);
      if (total <= 0n) throw new Error('Funding must be greater than zero.');
      const reference = new URLSearchParams(window.location.search).get(
        'reference',
      );
      if (reference && !/^0x[a-fA-F0-9]{64}$/.test(reference))
        throw new Error(
          'Invalid invoice payment reference. Open the payment from your workspace again.',
        );
      const referenceHash = (reference || zeroHash) as Hash;
      const durationMinutes = Number(data.get('duration'));
      if (
        !Number.isSafeInteger(durationMinutes) ||
        durationMinutes < 1 ||
        durationMinutes > 525600
      )
        throw new Error('Duration must be 1–525600 whole minutes.');
      const balance = await client!.readContract({
        address: musdAddress!,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address!],
      });
      if (balance < total)
        throw new Error('Insufficient MUSD. Fund your wallet first.');
      const allowance = await client!.readContract({
        address: musdAddress!,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address!, paymentAddress!],
      });
      if (allowance < total) {
        setNotice('Approve the exact funding amount in your wallet.');
        const { request } = await client!.simulateContract({
          account: address!,
          address: musdAddress!,
          abi: erc20Abi,
          functionName: 'approve',
          args: [paymentAddress!, total],
        });
        const approval = await wallet!.writeContract(request);
        setHash(approval);
        const receipt = await waitTracked(
          approval,
          'Approval',
          musdAddress!,
          encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [paymentAddress!, total],
          }),
        );
        if (receipt.status !== 'success')
          throw new Error('Approval reverted; no schedule was funded.');
      }
      // Use current chain time after approval, allowing two minutes for the next signature.
      const block = await client!.getBlock();
      const start = block.timestamp + 120n;
      const end = start + BigInt(durationMinutes) * 60n;
      setNotice(
        'Approval ready. Confirm schedule creation in your wallet; accrual starts about two minutes from now.',
      );
      const { request } = await client!.simulateContract({
        account: address!,
        address: paymentAddress!,
        abi: paymentsAbi,
        functionName: 'createSchedule',
        args: [getAddress(recipient), total, start, end, referenceHash],
      });
      recovery.checkStorage();
      const tx = await wallet!.writeContract(request);
      setHash(tx);
      setNotice('Schedule submitted. Waiting for confirmation…');
      const receipt = await waitTracked(
        tx,
        'Funding',
        paymentAddress!,
        encodeFunctionData({
          abi: paymentsAbi,
          functionName: 'createSchedule',
          args: [getAddress(recipient), total, start, end, referenceHash],
        }),
      );
      if (receipt.status !== 'success')
        throw new Error(
          'Creation reverted; no schedule was funded. Approval may remain. Retry with a fresh start time.',
        );
      const events = parseEventLogs({
        abi: paymentsAbi,
        logs: receipt.logs,
        eventName: 'ScheduleCreated',
      });
      const id = events[0]?.args.scheduleId;
      setNotice(
        id
          ? `Schedule #${id} confirmed. Share its recipient link below.`
          : 'Schedule confirmed. Refresh to view it.',
      );
      onCreated();
      window.history.replaceState(null, '', '/');
    });
  }

  return {
    notice,
    setNotice,
    hash,
    busy,
    historyRevision,
    setHistoryRevision,
    canTransact,
    create,
    settle,
  };
}
