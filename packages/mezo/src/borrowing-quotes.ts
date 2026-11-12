/** Exact integer accounting for the verified aa25fd6 BorrowerOperations rules.
 * These are snapshot estimates; transaction simulation and fresh reads remain mandatory.
 */
export const RATIO_SCALE = 10n ** 18n;
export const UINT256_MAX = (1n << 256n) - 1n;
export type LoanOperation = 'open' | 'borrow' | 'add-collateral' | 'repay';
export type LoanState = {
  active: boolean;
  collateral: bigint;
  debt: bigint;
  price: bigint;
  systemCollateral: bigint;
  /** Includes virtual system interest once, matching updateSystemInterest(). */
  systemDebt: bigint;
  minimumRatio: bigint;
  criticalRatio: bigint;
  minNetDebt: bigint;
  gasReserve: bigint;
  feeRate: bigint;
  feeExempt: boolean;
  /** Stored per-trove ceiling; collateral additions do not reset it. */
  maxBorrowingCapacity: bigint;
};
export type LoanInput = {
  operation: LoanOperation;
  collateralAdded: bigint;
  amount: bigint;
  targetRatio: bigint;
};
export function collateralRatio(
  collateral: bigint,
  debt: bigint,
  price: bigint,
) {
  return debt === 0n ? UINT256_MAX : (collateral * price) / debt;
}
function validate(state: LoanState, input: LoanInput) {
  for (const value of Object.values(state)) {
    if (typeof value === 'bigint' && (value < 0n || value > UINT256_MAX))
      throw new Error('Invalid protocol snapshot amount.');
  }
  if (
    state.price === 0n ||
    state.minimumRatio < RATIO_SCALE ||
    state.criticalRatio < state.minimumRatio ||
    state.feeRate > RATIO_SCALE ||
    state.minNetDebt === 0n ||
    state.gasReserve === 0n ||
    (state.active &&
      (state.debt < state.gasReserve || state.collateral === 0n)) ||
    (!state.active && (state.debt !== 0n || state.collateral !== 0n)) ||
    (state.active &&
      (state.systemDebt < state.debt ||
        state.systemCollateral < state.collateral))
  )
    throw new Error('Inconsistent protocol snapshot.');
  if (
    !['open', 'borrow', 'add-collateral', 'repay'].includes(input.operation) ||
    input.amount < 0n ||
    input.amount > UINT256_MAX ||
    input.collateralAdded < 0n ||
    input.collateralAdded > UINT256_MAX ||
    input.targetRatio < state.minimumRatio ||
    input.targetRatio > UINT256_MAX
  )
    throw new Error('Invalid loan amount, collateral or target ratio.');
}
export function quoteLoan(state: LoanState, input: LoanInput) {
  validate(state, input);
  const reasons: string[] = [];
  const increasing = input.operation === 'open' || input.operation === 'borrow';
  const recovery =
    collateralRatio(state.systemCollateral, state.systemDebt, state.price) <
    state.criticalRatio;
  const opening = input.operation === 'open';
  if (opening === state.active)
    reasons.push(
      opening
        ? 'This wallet already has an active trove.'
        : 'This action requires an active trove.',
    );
  if (increasing && input.amount === 0n)
    reasons.push('Enter a positive MUSD borrowing amount.');
  if (
    input.operation === 'repay' &&
    (input.amount === 0n || input.collateralAdded !== 0n)
  )
    reasons.push('Enter a positive repayment with no collateral change.');
  if (
    input.operation === 'add-collateral' &&
    (input.amount !== 0n || input.collateralAdded === 0n)
  )
    reasons.push('Enter positive BTC collateral with no MUSD change.');
  if (opening && input.collateralAdded === 0n)
    reasons.push('Opening a trove requires BTC collateral.');
  const fee =
    increasing && !recovery && !state.feeExempt
      ? (input.amount * state.feeRate) / RATIO_SCALE
      : 0n;
  const reserveAdded = opening ? state.gasReserve : 0n;
  const debtIncrease = increasing ? input.amount + fee + reserveAdded : 0n;
  const collateral = state.collateral + input.collateralAdded;
  const repayment = input.operation === 'repay' ? input.amount : 0n;
  const debt = state.debt + debtIncrease - repayment;
  const systemDebt = state.systemDebt + debtIncrease - repayment;
  const systemCollateral = state.systemCollateral + input.collateralAdded;
  if (debt < 0n || systemDebt < 0n)
    reasons.push('Repayment exceeds the position debt.');
  if (
    debt > UINT256_MAX ||
    collateral > UINT256_MAX ||
    systemDebt > UINT256_MAX ||
    systemCollateral > UINT256_MAX ||
    collateral * state.price > UINT256_MAX ||
    systemCollateral * state.price > UINT256_MAX ||
    (increasing &&
      !recovery &&
      !state.feeExempt &&
      input.amount * state.feeRate > UINT256_MAX)
  )
    reasons.push('Result exceeds the protocol amount limit.');
  const ratio =
    debt > 0n ? collateralRatio(collateral, debt, state.price) : undefined;
  const systemRatio =
    systemDebt > 0n
      ? collateralRatio(systemCollateral, systemDebt, state.price)
      : undefined;
  if (
    (opening || input.operation === 'repay') &&
    debt - state.gasReserve < state.minNetDebt
  )
    reasons.push(
      'Resulting net debt is below the protocol minimum. Full closure is a separate action.',
    );
  if (input.operation === 'borrow' && debt > state.maxBorrowingCapacity)
    reasons.push(
      'This amount exceeds the trove’s stored borrowing-capacity limit. Adding collateral does not reset that limit.',
    );
  if (recovery) {
    if (increasing && (ratio === undefined || ratio < state.criticalRatio))
      reasons.push(
        'Recovery Mode requires the resulting collateral ratio to meet CCR.',
      );
    if (
      input.operation === 'borrow' &&
      (ratio === undefined ||
        ratio < collateralRatio(state.collateral, state.debt, state.price))
    )
      reasons.push(
        'Recovery Mode borrowing must not reduce the existing collateral ratio; add sufficient collateral.',
      );
  } else {
    if (ratio === undefined || ratio < state.minimumRatio)
      reasons.push('Resulting collateral ratio is below MCR.');
    if (systemRatio === undefined || systemRatio < state.criticalRatio)
      reasons.push('This operation would leave the system below CCR.');
  }
  if (increasing && (ratio === undefined || ratio < input.targetRatio))
    reasons.push('Resulting collateral ratio is below your chosen target.');
  return {
    eligible: reasons.length === 0,
    reasons,
    recovery,
    fee,
    reserveAdded,
    proceeds: increasing ? input.amount : 0n,
    repayment,
    collateral,
    debt,
    debtIncrease,
    systemDebt,
    systemRatio,
    ratio,
    // SortedTroves sorts by nominal collateral / full debt, scaled by 1e20.
    nominalRatio: debt > 0n ? (collateral * 10n ** 20n) / debt : undefined,
  };
}

/** Largest proceeds satisfying all snapshot constraints; no automatic minimum-size borrowing. */
export function quoteHeadroom(
  state: LoanState,
  collateralAdded: bigint,
  targetRatio: bigint,
) {
  const operation = state.active ? 'borrow' : 'open';
  const input: LoanInput = {
    operation,
    collateralAdded,
    targetRatio,
    amount: 0n,
  };
  validate(state, input);
  const recovery =
    collateralRatio(state.systemCollateral, state.systemDebt, state.price) <
    state.criticalRatio;
  const collateral = state.collateral + collateralAdded;
  let upper = (collateral * state.price) / targetRatio;
  if (state.active && upper > state.maxBorrowingCapacity)
    upper = state.maxBorrowingCapacity;
  const reserve = state.active ? 0n : state.gasReserve;
  upper = upper > state.debt + reserve ? upper - state.debt - reserve : 0n;
  if (upper > UINT256_MAX) upper = UINT256_MAX;
  // Opening minimum makes eligibility non-monotone near zero. Search upper constraints
  // first, then independently check minimum debt on the final candidate.
  const fits = (amount: bigint) => {
    if (
      collateral * state.price > UINT256_MAX ||
      (state.systemCollateral + collateralAdded) * state.price > UINT256_MAX ||
      (!recovery && !state.feeExempt && amount * state.feeRate > UINT256_MAX)
    )
      return false;
    const fee =
      !recovery && !state.feeExempt
        ? (amount * state.feeRate) / RATIO_SCALE
        : 0n;
    const nextDebt = state.debt + reserve + amount + fee;
    if (
      nextDebt > UINT256_MAX ||
      nextDebt > (collateral * state.price) / targetRatio
    )
      return false;
    if (state.active && nextDebt > state.maxBorrowingCapacity) return false;
    if (recovery) {
      if (
        collateralRatio(collateral, nextDebt, state.price) < state.criticalRatio
      )
        return false;
      if (
        state.active &&
        collateralRatio(collateral, nextDebt, state.price) <
          collateralRatio(state.collateral, state.debt, state.price)
      )
        return false;
    } else if (
      collateralRatio(
        state.systemCollateral + collateralAdded,
        state.systemDebt + reserve + amount + fee,
        state.price,
      ) < state.criticalRatio
    )
      return false;
    return true;
  };
  let lower = 0n;
  while (lower < upper) {
    const middle = (lower + upper + 1n) / 2n;
    if (fits(middle)) lower = middle;
    else upper = middle - 1n;
  }
  const quote = quoteLoan(state, { ...input, amount: lower });
  return {
    proceeds: quote.eligible ? lower : 0n,
    reasons: quote.reasons,
    recovery,
  };
}
