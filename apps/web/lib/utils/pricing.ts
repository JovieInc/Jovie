/** Format cents as a dollar string without decimals */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

/** Calculate annual savings percentage vs monthly billing */
export function getAnnualSavingsPercent(
  monthlyAmount: number,
  annualAmount: number
): number {
  const yearlyAtMonthly = monthlyAmount * 12;
  return Math.round(((yearlyAtMonthly - annualAmount) / yearlyAtMonthly) * 100);
}
