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
import { paymentsAbi, TESTNET_CHAIN_ID, type TeamInvoice } from '@runway/mezo';
import { teamRequest } from '../teamApi';
import { musdAddress, paymentAddress } from '../config';
import { errorText } from '../format';
import { readPendingLoan, withWalletLock } from '../loanPending';
import {
  findFundingIntent,
  inspectIntentEvidence,
  saveIntentEvidence,
  type FundingIntent,
  type IntentStep,
} from '../fundingIntent';
import { paymentDurationMinutes } from '../paymentOptions';
import { apiFetch, readJson } from '../api';
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
  async function checkWallet() {
    if (
      !wallet ||
      (await wallet.getChainId()) !== TESTNET_CHAIN_ID ||
      (await wallet.getAddresses())[0]?.toLowerCase() !== address?.toLowerCase()
    )
      throw new Error(
        'Wallet account or network changed. Review the payment again.',
      );
  }

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
      await withWalletLock(address!, async () => {
        recovery.checkStorage();
        if (readPendingLoan(address!))
          throw new Error(
            'Check the saved loan transaction before submitting a payment.',
          );
        await action();
      });
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
    intent?: FundingIntent,
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
      ...(intent ? { fundingIntentId: intent.id } : {}),
    };
    recovery.save(tracked);
    setHash(tx);
    const step: IntentStep = action === 'Approval' ? 'approval' : 'funding';
    const saveIntent = (
      state: 'submitted' | 'confirmed' | 'reverted',
      replacesHash?: Hash,
    ) => {
      if (intent)
        saveIntentEvidence(
          address!,
          intent.id,
          step,
          {
            hash: tracked.hash,
            target: tracked.target,
            data: tracked.data,
            value: '0',
            submittedAt: tracked.submittedAt,
            state,
          },
          undefined,
          replacesHash,
        );
    };
    saveIntent('submitted');
    let changedAction = false;
    const receipt = await client!.waitForTransactionReceipt({
      hash: tx,
      timeout: 120000,
      ...(intent ? { confirmations: 13 } : {}),
      onReplaced: (replacement) => {
        changedAction = replacement.reason !== 'repriced';
        const previous = tracked.hash;
        tracked = { ...tracked, hash: replacement.transaction.hash };
        recovery.save(tracked);
        setHash(tracked.hash);
        if (!changedAction) saveIntent('submitted', previous);
      },
    });
    if (changedAction)
      throw new Error(
        'Transaction was replaced. Check the saved transaction before continuing.',
      );
    if (intent) {
      const saved = findFundingIntent(address!, intent.id);
      const result = await inspectIntentEvidence(
        client!,
        saved,
        saved.evidence[step]!,
      );
      saveIntentEvidence(address!, intent.id, step, {
        ...saved.evidence[step]!,
        ...result,
      });
      if (result.state === 'submitted')
        throw new Error(
          'Waiting for 12 block confirmations. Resume this plan after checking the saved transaction.',
        );
    }
    recovery.clear(tracked.hash);
    return receipt;
  }
  async function settleOne(id: bigint, cancel: boolean) {
    const { request } = await client!.simulateContract({
      account: address!,
      address: paymentAddress!,
      abi: paymentsAbi,
      functionName: cancel ? 'cancel' : 'claim',
      args: [id],
    });
    await checkWallet();
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
  }
  async function settle(id: bigint, cancel: boolean) {
    await transaction(() => settleOne(id, cancel));
  }
  /** Claims each listed schedule in turn; stops at the first failure or rejection. */
  async function claimMany(ids: bigint[]) {
    let done = 0;
    await transaction(async () => {
      for (const id of ids) {
        try {
          await settleOne(id, false);
        } catch (error) {
          throw new Error(
            `Claimed ${done} of ${ids.length}. Schedule #${id} stopped the batch: ${errorText(error)}`,
          );
        }
        done++;
      }
      setNotice(
        `Claimed ${done} schedule${done === 1 ? '' : 's'}. MUSD was sent to your wallet.`,
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
      const paymentType = String(data.get('paymentType') ?? 'schedule');
      if (!['schedule', 'one-time'].includes(paymentType))
        throw new Error('Choose a payment type.');
      const params = new URLSearchParams(window.location.search);
      const invoiceId = params.get('invoiceId');
      const workspaceId = params.get('workspaceId');
      async function checkInvoice() {
        if (!invoiceId && !workspaceId) return;
        if (!invoiceId || !workspaceId)
          throw new Error('Reopen this invoice from your workspace.');
        const reviewed = await teamRequest<TeamInvoice>(
          `/workspaces/${encodeURIComponent(workspaceId)}/invoices/${encodeURIComponent(invoiceId)}/payment-plan`,
        );
        if (
          reviewed.recipient.toLowerCase() !== recipient.toLowerCase() ||
          reviewed.amountBaseUnits !== total.toString() ||
          (reviewed.paymentType ?? 'schedule') !== paymentType ||
          reviewed.paymentReference?.toLowerCase() !==
            referenceHash.toLowerCase()
        )
          throw new Error(
            'Payment terms differ from the approved invoice. Reopen it from your workspace.',
          );
      }
      await checkInvoice();
      if (
        paymentType === 'one-time' &&
        referenceHash !== zeroHash &&
        (!invoiceId || !workspaceId)
      )
        throw new Error(
          'Open this one-time invoice from your workspace again.',
        );
      const durationMinutes =
        paymentType === 'schedule'
          ? paymentDurationMinutes(
              String(data.get('duration')),
              String(data.get('durationUnit') ?? 'minutes'),
            )
          : 0;
      const intentId = params.get('intent');
      const intent = intentId
        ? findFundingIntent(address!, intentId)
        : undefined;
      if (intent) {
        if (
          intent.recipient.toLowerCase() !== recipient.toLowerCase() ||
          intent.amountBaseUnits !== total.toString() ||
          intent.paymentType !== paymentType ||
          intent.durationMinutes !== durationMinutes ||
          intent.reference.toLowerCase() !== referenceHash.toLowerCase() ||
          (intent.invoiceId ?? null) !== invoiceId ||
          (intent.workspaceId ?? null) !== workspaceId
        )
          throw new Error(
            'Payment terms differ from this saved plan. Reopen the plan before signing.',
          );
        if (
          intent.evidence.loan &&
          (await inspectIntentEvidence(client!, intent, intent.evidence.loan))
            .state !== 'confirmed'
        )
          throw new Error(
            'Check and confirm the saved borrowing transaction before funding.',
          );
        if (
          intent.evidence.funding &&
          (
            await inspectIntentEvidence(
              client!,
              intent,
              intent.evidence.funding,
            )
          ).state !== 'reverted'
        )
          throw new Error(
            'This plan already has a payment transaction. Check its receipt; do not fund it again.',
          );
        if (
          intent.evidence.approval &&
          (
            await inspectIntentEvidence(
              client!,
              intent,
              intent.evidence.approval,
            )
          ).state === 'submitted'
        )
          throw new Error(
            'Approval is still awaiting confirmations. Resume this plan after checking its receipt.',
          );
      }
      const balance = await client!.readContract({
        address: musdAddress!,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address!],
      });
      if (balance < total)
        throw new Error('Insufficient MUSD. Fund your wallet first.');
      if (paymentType === 'one-time') {
        setNotice('Confirm the one-time MUSD payment in your wallet.');
        const args = [getAddress(recipient), total] as const;
        const { request, result } = await client!.simulateContract({
          account: address!,
          address: musdAddress!,
          abi: erc20Abi,
          functionName: 'transfer',
          args,
        });
        if (!result)
          throw new Error(
            'The token rejected this payment. No transaction was submitted.',
          );
        recovery.checkStorage();
        await checkWallet();
        await checkInvoice();
        const tx = await wallet!.writeContract(request);
        setNotice('Payment submitted. Waiting for confirmation…');
        const receipt = await waitTracked(
          tx,
          'Payment',
          musdAddress!,
          encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args }),
          undefined,
          intent,
        );
        if (receipt.status !== 'success')
          throw new Error(
            'Payment reverted. Check the transaction before retrying.',
          );
        setNotice(
          'One-time payment confirmed. MUSD was sent directly to the recipient. View the transaction for your receipt.',
        );
        if (invoiceId && workspaceId) {
          try {
            const response = await apiFetch(
              `/api/workspaces/${encodeURIComponent(workspaceId)}/invoices/${encodeURIComponent(invoiceId)}/payment`,
              {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  transactionHash: receipt.transactionHash,
                }),
              },
            );
            const result = await readJson<{ error?: string }>(response);
            if (!response.ok)
              throw new Error(result.error || 'Invoice update unavailable.');
            setNotice(
              'Payment confirmed and linked to the invoice. Invoice status updates after 12 confirmations.',
            );
          } catch {
            setNotice(
              'Payment confirmed, but the invoice link could not be saved. Do not pay again. Copy this transaction hash and use Link payment transaction in your workspace.',
            );
          }
        }
        if (!intent) {
          onCreated();
          window.history.replaceState(null, '', '/');
        }
        return;
      }
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
        await checkWallet();
        await checkInvoice();
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
          undefined,
          intent,
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
      await checkWallet();
      await checkInvoice();
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
        undefined,
        intent,
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
      if (!intent) {
        onCreated();
        window.history.replaceState(null, '', '/');
      }
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
    claimMany,
  };
}
