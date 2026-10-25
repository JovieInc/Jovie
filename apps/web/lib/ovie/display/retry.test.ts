import { describe, expect, it } from 'vitest';
import { displayRetryDelayMs } from './retry';

describe('displayRetryDelayMs', () => {
  it('backs off and caps at a minute', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 50].map(displayRetryDelayMs)).toEqual([
      2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000,
    ]);
  });
  it('treats junk attempts as the first', () => {
    expect(displayRetryDelayMs(-3)).toBe(2000);
  });
});
