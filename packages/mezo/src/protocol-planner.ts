import { quoteHeadroom, quoteLoan, type LoanState } from './borrowing-quotes';
/** Hypothetical price scenario with the same eligibility rules as loan review. */
export function protocolBorrowingScenario(
  state: LoanState,
  dropPercent: number,
  targetRatio: bigint,
  collateralAdded = 0n,
  needed?: bigint,
) {
  if (!Number.isInteger(dropPercent) || dropPercent < 0 || dropPercent > 100)
    throw new Error('Choose a whole price drop from 0 to 100%.');
  const price = (state.price * BigInt(100 - dropPercent)) / 100n;
  if (price === 0n)
    return {
      proceeds: 0n,
      recovery: true,
      reasons: ['A zero-price scenario cannot support additional borrowing.'],
      quote: undefined,
    };
  const scenario = { ...state, price };
  const capacity = quoteHeadroom(scenario, collateralAdded, targetRatio);
  return {
    ...capacity,
    quote:
      needed !== undefined && needed > 0n
        ? quoteLoan(scenario, {
            operation: state.active ? 'borrow' : 'open',
            collateralAdded,
            targetRatio,
            amount: needed,
          })
        : undefined,
  };
}
