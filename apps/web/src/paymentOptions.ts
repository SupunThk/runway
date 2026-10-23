export const durationUnits = {
  minutes: { label: 'Minutes', minutes: 1, max: 525600 },
  hours: { label: 'Hours', minutes: 60, max: 8760 },
  days: { label: 'Days', minutes: 1440, max: 365 },
} as const;

export type DurationUnit = keyof typeof durationUnits;

export function paymentDurationMinutes(value: string, unit: string): number {
  if (!Object.hasOwn(durationUnits, unit))
    throw new Error('Choose minutes, hours, or days.');
  const option = durationUnits[unit as DurationUnit];
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > option.max)
    throw new Error(
      `Enter 1–${option.max} whole ${option.label.toLowerCase()}.`,
    );
  return amount * option.minutes;
}
