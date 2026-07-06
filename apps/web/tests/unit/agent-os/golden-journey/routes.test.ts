import { describe, expect, it } from 'vitest';
import {
  assertValidGoldenJourneyRouteId,
  GOLDEN_JOURNEY_ROUTES,
  getGoldenJourneyRoute,
} from '@/lib/agent-os/golden-journey/routes';

describe('GOLDEN_JOURNEY_ROUTES', () => {
  it('has unique, filename-safe route ids', () => {
    const ids = GOLDEN_JOURNEY_ROUTES.map(route => route.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(assertValidGoldenJourneyRouteId(id)).toBe(id);
    }
  });

  it('covers logged-out and seeded logged-in states', () => {
    const states = new Set(GOLDEN_JOURNEY_ROUTES.map(route => route.authState));
    expect(states.has('logged-out')).toBe(true);
    expect(states.has('creator-ready')).toBe(true);
  });

  it('uses app-relative paths', () => {
    for (const route of GOLDEN_JOURNEY_ROUTES) {
      expect(route.path.startsWith('/')).toBe(true);
    }
  });

  it('rejects traversal-shaped route ids', () => {
    expect(() => assertValidGoldenJourneyRouteId('../etc')).toThrow();
    expect(() => assertValidGoldenJourneyRouteId('bad/slash')).toThrow();
  });

  it('looks up routes by id', () => {
    expect(getGoldenJourneyRoute('home-logged-out')?.path).toBe('/');
    expect(getGoldenJourneyRoute('nope')).toBeNull();
  });
});
