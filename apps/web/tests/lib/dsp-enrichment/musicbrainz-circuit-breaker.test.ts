import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { musicBrainzCircuitBreaker } from '@/lib/dsp-enrichment/circuit-breakers';
import { MusicBrainzError } from '@/lib/dsp-enrichment/providers/musicbrainz';

describe('musicBrainzCircuitBreaker', () => {
  beforeEach(() => {
    musicBrainzCircuitBreaker.reset();
  });

  it('does not count rate-limit errors toward opening the circuit', async () => {
    for (let i = 0; i < 12; i += 1) {
      await expect(
        musicBrainzCircuitBreaker.execute(async () => {
          throw new MusicBrainzError('rate limited', 429, 'RATE_LIMITED');
        })
      ).rejects.toThrow('rate limited');
    }

    expect(musicBrainzCircuitBreaker.getState()).toBe('CLOSED');
  });

  it('opens for repeated non-rate-limit failures', async () => {
    for (let i = 0; i < 10; i += 1) {
      await expect(
        musicBrainzCircuitBreaker.execute(async () => {
          throw new MusicBrainzError('provider down', 500, 'UPSTREAM_ERROR');
        })
      ).rejects.toThrow('provider down');
    }

    expect(musicBrainzCircuitBreaker.getState()).toBe('OPEN');
  });
});
