const unit = 10n ** 18n;

/** Price-only scenarios. All amounts and ratios use 18-decimal integers. */
export function borrowingStress(
  collateral: bigint,
  debt: bigint,
  minimumRatio: bigint,
  price: bigint,
  dropPercent: number,
) {
  if (collateral <= 0n || debt <= 0n || minimumRatio <= 0n || price <= 0n)
    throw new Error('A positive borrowing snapshot is required.');
  if (!Number.isInteger(dropPercent) || dropPercent < 0 || dropPercent > 100)
    throw new Error('Price drop must be a whole percentage from 0 to 100.');
  const scenarioPrice = (price * BigInt(100 - dropPercent)) / 100n;
  const ratio = (collateral * scenarioPrice) / debt;
  // Round up to the first representable price at or above the threshold.
  const thresholdPrice = (debt * minimumRatio + collateral - 1n) / collateral;
  return {
    price: scenarioPrice,
    ratio,
    thresholdPrice,
    // Classify using full precision, before display truncation.
    belowThreshold: collateral * scenarioPrice < debt * minimumRatio,
    atThreshold: collateral * scenarioPrice === debt * minimumRatio,
    collateralValue: (collateral * scenarioPrice) / unit,
  };
}
