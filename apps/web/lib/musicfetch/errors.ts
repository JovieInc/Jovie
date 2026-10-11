import 'server-only';

export type MusicfetchBudgetScope = 'daily' | 'monthly' | 'backend_unavailable';
const INVALID_SERVICES_ERROR_FRAGMENT = 'services - Invalid value';

export class MusicfetchRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryAfterSeconds?: number,
    public readonly details?: string
  ) {
    super(message);
    this.name = 'MusicfetchRequestError';
  }
}

/**
 * MusicFetch is unavailable (401/403) or the circuit is already open.
 * Callers must not retry. Use the in-house resolver, then cached data.
 * A lookup that only MusicFetch can answer is a known limitation.
 */
export class MusicfetchVendorUnavailableError extends MusicfetchRequestError {
  readonly vendorUnavailable = true;
  readonly failureClass = 'vendor_unavailable' as const;

  constructor(message: string, statusCode?: number, details?: string) {
    super(message, statusCode, undefined, details);
    this.name = 'MusicfetchVendorUnavailableError';
  }
}

export function isMusicfetchVendorUnavailable(error: unknown): boolean {
  if (error instanceof MusicfetchVendorUnavailableError) return true;
  if (!(error instanceof Error)) return false;
  if (
    'vendorUnavailable' in error &&
    (error as { vendorUnavailable?: unknown }).vendorUnavailable === true
  ) {
    return true;
  }

  const statusCode =
    'statusCode' in error &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : undefined;
  if (statusCode !== 401 && statusCode !== 403) return false;

  return (
    error instanceof MusicfetchRequestError ||
    error.name === 'MusicfetchRequestError' ||
    error.name === 'MusicfetchVendorUnavailableError'
  );
}

export class MusicfetchBudgetExceededError extends MusicfetchRequestError {
  constructor(
    message: string,
    public readonly budgetScope: MusicfetchBudgetScope,
    retryAfterSeconds?: number
  ) {
    super(message, 429, retryAfterSeconds);
    this.name = 'MusicfetchBudgetExceededError';
  }
}

export function isMusicfetchInvalidServicesError(
  error: Pick<MusicfetchRequestError, 'statusCode' | 'details' | 'message'>
): boolean {
  const detail = error.details ?? error.message;
  return (
    error.statusCode === 400 &&
    typeof detail === 'string' &&
    detail.includes(INVALID_SERVICES_ERROR_FRAGMENT)
  );
}
