import { useState } from 'react';
import type { Address } from 'viem';
import { TESTNET_CHAIN_ID } from '@runway/mezo';

export type SetupState = {
  address?: Address;
  chainId?: number;
  btc?: bigint;
  musd?: bigint;
  hasSchedule: boolean;
};

/** Each step is detected from live wallet state, never self-reported. */
export function setupSteps(state: SetupState) {
  return [
    {
      key: 'connect',
      label: 'Connect a wallet',
      done: Boolean(state.address),
      help: 'Use the Connect button at the top right. A fresh test wallet is safest.',
    },
    {
      key: 'network',
      label: 'Switch to Mezo testnet',
      done: state.chainId === TESTNET_CHAIN_ID,
      help: 'Open Wallet setup at the top right and choose “Use Mezo testnet”.',
    },
    {
      key: 'btc',
      label: 'Get test BTC for gas',
      done: (state.btc ?? 0n) > 0n,
      help: 'Request free testnet BTC from the Mezo faucet.',
      link: { href: 'https://faucet.test.mezo.org/', text: 'Open faucet ↗' },
    },
    {
      key: 'musd',
      label: 'Get test MUSD to pay with',
      done: (state.musd ?? 0n) > 0n,
      help: 'Borrow MUSD against your test BTC in the Mezo testnet app, or use the Borrowing page here.',
      link: { href: 'https://testnet.mezo.org/borrow', text: 'Borrow MUSD ↗' },
    },
    {
      key: 'schedule',
      label: 'Send your first payment',
      done: state.hasSchedule,
      help: 'Create a payment over time or a one-time transfer.',
    },
  ];
}

const KEY = 'runway:getting-started-dismissed';
function dismissed() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function GettingStarted({
  state,
  balancesLoaded,
  onCreate,
}: {
  state: SetupState;
  balancesLoaded: boolean;
  onCreate: () => void;
}) {
  const [hidden, setHidden] = useState(dismissed);
  const steps = setupSteps(state);
  const remaining = steps.filter((s) => !s.done).length;
  // Wait for balances so returning users never see a flash of false "to do" steps.
  if (hidden || remaining === 0 || (state.address && !balancesLoaded))
    return null;
  const current = steps.find((s) => !s.done)!;
  return (
    <section className="panel getting-started" aria-label="Getting started">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            GETTING STARTED · {steps.length - remaining} OF {steps.length} DONE
          </span>
          <h2>Set up your first payment</h2>
        </div>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            try {
              localStorage.setItem(KEY, '1');
            } catch {
              /* Dismissal is a convenience; ignore blocked storage. */
            }
            setHidden(true);
          }}
        >
          Hide
        </button>
      </div>
      <ol className="setup-steps">
        {steps.map((step) => (
          <li
            key={step.key}
            className={
              step.done ? 'done' : step === current ? 'current' : undefined
            }
          >
            <span className="setup-mark" aria-hidden="true">
              {step.done ? '✓' : ''}
            </span>
            <div>
              <strong>
                {step.label}
                <span className="sr-only">
                  {step.done ? ' (done)' : ' (to do)'}
                </span>
              </strong>
              {step === current ? (
                <p>
                  {step.help}{' '}
                  {step.link ? (
                    <a href={step.link.href} target="_blank" rel="noreferrer">
                      {step.link.text}
                    </a>
                  ) : null}
                  {step.key === 'schedule' ? (
                    <button
                      type="button"
                      className="text-button"
                      onClick={onCreate}
                    >
                      Create a payment →
                    </button>
                  ) : null}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
