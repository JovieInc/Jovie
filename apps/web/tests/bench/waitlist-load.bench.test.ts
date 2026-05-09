import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { evaluateWaitlistQualification } from '@/lib/waitlist/qualification';
import { generateWaitlistInviteTokenPair } from '@/lib/waitlist/tokens';

const SAMPLE_SIZE = 5_000;

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
  );
}

describe('waitlist synthetic load benchmark', () => {
  it('simulates burst qualification, duplicate collapse, and invite token generation', () => {
    const seenEmails = new Set<string>();
    const qualificationDurations: number[] = [];
    const tokenDurations: number[] = [];
    let duplicates = 0;

    for (let index = 0; index < SAMPLE_SIZE; index += 1) {
      const email = `artist-${index % 1000}@example.com`;
      const normalizedEmail = email.toLowerCase();

      if (seenEmails.has(normalizedEmail)) {
        duplicates += 1;
      } else {
        seenEmails.add(normalizedEmail);
      }

      const qualifyStart = performance.now();
      const decision = evaluateWaitlistQualification({
        email,
        payload: {
          primaryGoal: 'launch',
          primarySocialUrl: `https://instagram.com/artist${index}`,
          spotifyUrl: undefined,
          spotifyArtistName: undefined,
          heardAbout: undefined,
          selectedPlan: undefined,
        } as never,
        config: {
          mode: index % 2 === 0 ? 'open_signup' : 'waitlist_enabled',
          autoAcceptReserved: index % 10 === 0,
        },
      });
      qualificationDurations.push(performance.now() - qualifyStart);
      expect(decision.reasonCode).toBeTruthy();

      const tokenStart = performance.now();
      const token = generateWaitlistInviteTokenPair();
      tokenDurations.push(performance.now() - tokenStart);
      expect(token.tokenHash).toHaveLength(64);
    }

    const qualificationP95 = percentile(qualificationDurations, 0.95);
    const tokenP95 = percentile(tokenDurations, 0.95);

    console.info('[waitlist-load-benchmark]', {
      sampleSize: SAMPLE_SIZE,
      uniqueEmails: seenEmails.size,
      duplicates,
      qualificationP50: Math.round(percentile(qualificationDurations, 0.5)),
      qualificationP95,
      qualificationP99: percentile(qualificationDurations, 0.99),
      tokenP95,
    });

    expect(seenEmails.size).toBe(1000);
    expect(duplicates).toBe(4000);
    expect(qualificationP95).toBeLessThan(5);
    expect(tokenP95).toBeLessThan(5);
  });
});
