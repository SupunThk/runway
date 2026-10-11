import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';
import { formatUnits, getAddress, isAddress, type Address } from 'viem';
import {
  borrowingDeployment,
  readBorrowingPosition,
  TESTNET_CHAIN_ID,
} from '@runway/mezo';
import { explorer, musdAddress } from './config';
import { BorrowingStress } from './BorrowingStress';

const percent = (ratio: bigint) => `${formatUnits(ratio / 10n ** 12n, 4)}%`;
export function BorrowingPosition() {
  const { address } = useAccount();
  const client = usePublicClient({ chainId: TESTNET_CHAIN_ID });
  const [draft, setDraft] = useState('');
  const [selected, setSelected] = useState<Address>();
  const [inputError, setInputError] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const account = selected ?? address;
  const position = useQuery({
    queryKey: [
      'borrowing',
      TESTNET_CHAIN_ID,
      client?.transport.url,
      account,
      musdAddress,
    ],
    enabled: Boolean(account && client && musdAddress),
    queryFn: () => readBorrowingPosition(client!, account!, musdAddress!),
    retry: false,
    refetchInterval: 30000,
    staleTime: 15000,
  });
  const data = position.data;
  const stale = Boolean(
    data &&
    (now - position.dataUpdatedAt > 60000 ||
      now / 1000 - Number(data.chainTime) > 120 ||
      Number(data.chainTime) - now / 1000 > 60),
  );
  const price =
    data?.active && !position.error && !stale ? data.price : undefined;
  return (
    <section
      className="info-card light borrowing"
      aria-label="Mezo borrowing position"
    >
      <span className="eyebrow">MEZO BORROWING · READ ONLY</span>
      <h2>Your borrowing position</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!isAddress(draft) || BigInt(draft) === 0n) {
            setInputError('Enter a valid borrowing account address.');
            return;
          }
          setInputError('');
          setSelected(getAddress(draft));
        }}
      >
        <label>
          Borrowing account
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={address ?? '0x…'}
            autoComplete="off"
          />
        </label>
        <div className="actions">
          <button className="button secondary">Check borrowing</button>
          {selected && address && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setSelected(undefined);
                setDraft('');
              }}
            >
              Use connected wallet
            </button>
          )}
        </div>
      </form>
      {inputError && <p role="alert">{inputError}</p>}
      {!account && (
        <p>
          Connect your wallet or enter an address to read its Mezo testnet loan.
        </p>
      )}
      {account && (
        <p>
          Account:{' '}
          <a
            href={`${explorer}/address/${account}`}
            title={account}
            target="_blank"
            rel="noreferrer"
          >
            {account}
          </a>
        </p>
      )}
      {account && !musdAddress && (
        <p role="alert">
          MUSD configuration is unavailable. Borrowing reads are disabled.
        </p>
      )}
      {position.isFetching && <p role="status">Reading borrowing position…</p>}
      {position.error && (
        <p role="alert">
          Borrowing read unavailable. {position.error.message.split('\n')[0]}{' '}
          {data
            ? 'Previous snapshot below; loan health is unknown.'
            : 'Debt and loan health are unknown.'}
        </p>
      )}
      {data && (
        <>
          <p className="hint">
            {stale ? 'Stale snapshot · ' : ''}Block {String(data.blockNumber)} ·{' '}
            {new Date(Number(data.chainTime) * 1000)
              .toISOString()
              .replace('T', ' ')
              .replace('.000Z', ' UTC')}
          </p>
          {!data.active ? (
            <p>
              {
                [
                  'No Mezo borrowing position found for this account.',
                  '',
                  'Position closed by its owner.',
                  'Position closed by liquidation.',
                  'Position closed by redemption.',
                ][data.status]
              }{' '}
              Runway payment balances do not establish a borrowing position.
            </p>
          ) : (
            <>
              <dl className="borrowing-values">
                <div>
                  <dt>BTC collateral</dt>
                  <dd>{formatUnits(data.collateral, 18)} BTC</dd>
                </div>
                <div>
                  <dt>Total protocol debt</dt>
                  <dd>{formatUnits(data.debt, 18)} MUSD</dd>
                </div>
                <div>
                  <dt>Accrued interest included</dt>
                  <dd>{formatUnits(data.interest, 18)} MUSD</dd>
                </div>
                <div>
                  <dt>Fixed annual interest rate</dt>
                  <dd>{formatUnits(BigInt(data.rate), 2)}%</dd>
                </div>
                <div>
                  <dt>Liquidation threshold</dt>
                  <dd>{percent(data.minimumRatio)}</dd>
                </div>
                {price && (
                  <>
                    <div>
                      <dt>Protocol BTC price</dt>
                      <dd>{formatUnits(price.value, 18)} USD</dd>
                    </div>
                    <div>
                      <dt>Collateral ratio</dt>
                      <dd>{percent(price.ratio)}</dd>
                    </div>
                  </>
                )}
              </dl>
              <p className="hint">
                Debt includes accrued interest, redistribution and the{' '}
                {formatUnits(data.gasReserve, 18)} MUSD protocol gas reserve.
                This total is not a repayment quote. Paying a contractor does
                not repay this loan.
              </p>
              {price ? (
                <>
                  <p
                    className={
                      price.ratio < data.minimumRatio
                        ? 'callout warning'
                        : 'hint'
                    }
                  >
                    {price.ratio < data.minimumRatio
                      ? 'Below the protocol liquidation threshold at this snapshot.'
                      : 'Above the protocol liquidation threshold at this snapshot. Prices can change; this does not guarantee protection from liquidation or redemption.'}
                  </p>
                  <p className="hint">
                    Oracle updated{' '}
                    {new Date(Number(price.updatedAt) * 1000)
                      .toISOString()
                      .replace('T', ' ')
                      .replace('.000Z', ' UTC')}
                    .
                  </p>
                  <BorrowingStress
                    key={account}
                    collateral={data.collateral}
                    debt={data.debt}
                    minimumRatio={data.minimumRatio}
                    price={price.value}
                  />
                </>
              ) : (
                <p role="alert">
                  Loan health unknown:{' '}
                  {stale
                    ? 'the snapshot is stale.'
                    : position.error
                      ? 'the latest refresh failed.'
                      : (data.priceError ?? 'protocol price unavailable.')}
                </p>
              )}
            </>
          )}
        </>
      )}
      <div className="actions">
        {account && (
          <button
            className="text-button"
            disabled={position.isFetching || !musdAddress}
            onClick={() => void position.refetch()}
          >
            Refresh borrowing
          </button>
        )}
        <a href="https://testnet.mezo.org" target="_blank" rel="noreferrer">
          Manage borrowing in Mezo ↗
        </a>
      </div>
      <p className="hint">
        Source:{' '}
        <a
          href={`${explorer}/address/${borrowingDeployment.manager}`}
          target="_blank"
          rel="noreferrer"
        >
          Mezo testnet TroveManager
        </a>
        . Position and price reads share the displayed block. Loan management
        opens Mezo.
      </p>
    </section>
  );
}
