import { expect, it } from 'vitest';
import { DICTATION_LIMITS } from './limits';

it('keeps the approved shared audio and token budgets', () => {
  expect(DICTATION_LIMITS).toEqual({
    dailyAudioSecondsPerAccount: 3600,
    maxSessionSeconds: 600,
    tokenMintsPerHour: 30,
  });
});
