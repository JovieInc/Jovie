import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getP0JourneySlo,
  P0_JOURNEY_SLOS,
  P0JourneySloSchema,
  TRACE_HOPS,
} from '@/lib/observability/p0-journey-slos';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

describe('P0 journey SLO registry (JOV-6052)', () => {
  it('every entry conforms to the schema', () => {
    for (const journey of P0_JOURNEY_SLOS) {
      const result = P0JourneySloSchema.safeParse(journey);
      expect(
        result.success,
        `${journey.id}: ${result.success ? '' : JSON.stringify(result.error.issues)}`
      ).toBe(true);
    }
  });

  it('has unique journey ids', () => {
    const ids = P0_JOURNEY_SLOS.map(journey => journey.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every journey binds its SLO to a user-visible outcome, not infra health', () => {
    for (const journey of P0_JOURNEY_SLOS) {
      expect(journey.userVisibleSuccess.length).toBeGreaterThan(10);
      // The good event must describe the user-visible success, not a bare
      // process/uptime signal.
      expect(journey.sli.goodEvent).not.toMatch(/cpu|memory|uptime|pod/i);
      expect(journey.sli.goodEvent).not.toBe(journey.sli.totalEvent);
    }
  });

  it('every journey has an actionable alert with owner and a real runbook file', () => {
    for (const journey of P0_JOURNEY_SLOS) {
      expect(journey.alert.threshold.length).toBeGreaterThan(0);
      expect(journey.alert.channel).toMatch(/^#/);
      expect(journey.owner.length).toBeGreaterThan(0);
      expect(
        existsSync(join(REPO_ROOT, journey.runbook)),
        `${journey.id} runbook ${journey.runbook} must exist`
      ).toBe(true);
    }
  });

  it('every journey has a silent-failure check and multi-hop correlation', () => {
    for (const journey of P0_JOURNEY_SLOS) {
      expect(journey.silentFailureCheck.length).toBeGreaterThan(0);
      const hops = journey.correlation.hops;
      expect(hops.length).toBeGreaterThanOrEqual(2);
      for (const hop of hops) {
        expect(TRACE_HOPS).toContain(hop);
      }
      // Correlation hops must be ordered along the request path.
      const indices = hops.map(hop => TRACE_HOPS.indexOf(hop));
      expect([...indices].sort((a, b) => a - b)).toEqual(indices);
      // No duplicate hops.
      expect(new Set(hops).size).toBe(hops.length);
    }
  });

  it('journeys with async work declare durable state and orphan detection', () => {
    const withAsync = P0_JOURNEY_SLOS.filter(journey => journey.asyncWork);
    expect(withAsync.length).toBeGreaterThan(0);
    for (const journey of withAsync) {
      expect(journey.asyncWork?.durableState.length).toBeGreaterThan(0);
      expect(journey.asyncWork?.orphanDetection.length).toBeGreaterThan(0);
      // Async work crosses at least one durable boundary beyond api/db.
      expect(journey.correlation.hops).toContainEqual(
        expect.stringMatching(/queue|provider|model/)
      );
    }
  });

  it('critical user-facing journeys page, not just ticket', () => {
    for (const id of [
      'marketing-home-render',
      'artist-profile-public',
      'checkout-billing',
      'signup-onboarding',
    ]) {
      expect(getP0JourneySlo(id)?.alert.severity).toBe('page');
    }
  });

  it('getP0JourneySlo resolves known ids and returns undefined for unknown', () => {
    expect(getP0JourneySlo('checkout-billing')?.title).toContain('Stripe');
    expect(getP0JourneySlo('nope')).toBeUndefined();
  });
});
