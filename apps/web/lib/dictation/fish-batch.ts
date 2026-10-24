import { DictationError } from './errors';
import { DICTATION_LIMITS } from './limits';
import type { DictationProvider } from './types';
/** Unregistered until the Fish batch integration has been implemented and verified. */
export const fishBatchProvider: DictationProvider = {
  id: 'fish-batch',
  capabilities: {
    streaming: false,
    partials: false,
    batch: true,
    languages: ['auto'],
    maxSessionSec: DICTATION_LIMITS.maxSessionSeconds,
    fullDuplexSafe: false,
    runsIn: ['web', 'electron'],
  },
  health: () => false,
  // TODO: Implement Fish Audio batch authentication and transcription before registration.
  async transcribe() {
    throw new DictationError('provider-down');
  },
};
