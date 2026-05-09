export type MercuryDefaultStatus = 'alive' | 'dead' | 'unknown';

export function computeReliabilityScore(errorRatePercent: number): number {
  return Math.max(0, Math.min(100, 100 - errorRatePercent));
}

export function computeMercuryDefaultStatus(
  isAvailable: boolean,
  balanceUsd: number,
  burnRateUsd: number
): MercuryDefaultStatus {
  if (!isAvailable) return 'unknown';
  return balanceUsd > burnRateUsd ? 'alive' : 'dead';
}
