import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import type { WaitlistRequestPayload } from '@/lib/validation/schemas';
import { evaluateWaitlistQualification } from '@/lib/waitlist/qualification';
import { generateWaitlistInviteTokenPair } from '@/lib/waitlist/tokens';

const SAMPLE_SIZE = 5_000;

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
  );
}

describe.skipIf(process.env.RUN_WAITLIST_PERF_BENCH !== '1')(
  'waitlist synthetic load performance thresholds',
  () => {
    it('keeps qualification and token generation p95 under the benchmark budget', () => {
      const qualificationDurations: number[] = [];
      const tokenDurations: number[] = [];

      for (let index = 0; index < SAMPLE_SIZE; index += 1) {
        const payload = {
          primaryGoal: 'streams',
          primarySocialUrl: `https://instagram.com/artist${index}`,
          spotifyUrl: undefined,
          spotifyArtistName: undefined,
          heardAbout: undefined,
          selectedPlan: undefined,
        } satisfies WaitlistRequestPayload;

        const qualifyStart = performance.now();
        evaluateWaitlistQualification({
          email: `artist-${index}@example.com`,
          payload,
          config: { mode: 'waitlist_enabled' },
        });
        qualificationDurations.push(performance.now() - qualifyStart);

        const tokenStart = performance.now();
        generateWaitlistInviteTokenPair();
        tokenDurations.push(performance.now() - tokenStart);
      }

      expect(percentile(qualificationDurations, 0.95)).toBeLessThan(5);
      expect(percentile(tokenDurations, 0.95)).toBeLessThan(5);
    });
  }
);
