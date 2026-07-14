export type InitialConfirmationStatus = 'confirmed' | 'pending';

/**
 * Derive the trust state for a newly inserted event without importing the
 * database layer. Manual creator entries are trusted immediately; every
 * synced or future non-manual provider must be reviewed first.
 */
export function deriveConfirmationStatus(
  provider: string
): InitialConfirmationStatus {
  return provider === 'manual' ? 'confirmed' : 'pending';
}
