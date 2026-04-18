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
