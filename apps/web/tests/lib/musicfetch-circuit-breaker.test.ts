import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { MusicfetchError } from '@/lib/discography/musicfetch';
import { musicfetchCircuitBreaker } from '@/lib/discography/musicfetch-circuit-breaker';

describe('musicfetchCircuitBreaker', () => {
  beforeEach(() => {
    musicfetchCircuitBreaker.reset();
  });

  it('does not count 429 rate-limit errors toward opening the circuit', async () => {
    for (let i = 0; i < 12; i += 1) {
      await expect(
        musicfetchCircuitBreaker.execute(async () => {
          throw new MusicfetchError('rate limited', 429);
        })
      ).rejects.toThrow('rate limited');
    }

    expect(musicfetchCircuitBreaker.getState()).toBe('CLOSED');
  });

  it('opens for repeated non-429 failures', async () => {
    for (let i = 0; i < 10; i += 1) {
      await expect(
        musicfetchCircuitBreaker.execute(async () => {
          throw new MusicfetchError('provider down', 503);
        })
      ).rejects.toThrow('provider down');
    }

    expect(musicfetchCircuitBreaker.getState()).toBe('OPEN');
  });
});
