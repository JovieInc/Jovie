/** Caller cancellation is not evidence of an unhealthy upstream provider. */
export class CallerCancellationError extends Error {
  constructor() {
    super('Request cancelled');
    this.name = 'CallerCancellationError';
  }
}
