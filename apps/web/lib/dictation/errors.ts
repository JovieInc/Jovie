import type { DictationErrorCode } from './types';
export class DictationError extends Error {
  constructor(readonly code: DictationErrorCode) {
    super(code);
    this.name = 'DictationError';
  }
}
