import 'server-only';

export type MusicfetchBudgetScope = 'daily' | 'monthly' | 'backend_unavailable';

export class MusicfetchRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryAfterSeconds?: number
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
