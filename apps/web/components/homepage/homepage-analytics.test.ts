import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Shared workers may have evaluated these modules with another file's mocks.
vi.hoisted(() => vi.resetModules());
// Do not leave this file's mocked dependency graph cached for the next file.
afterAll(() => vi.resetModules());

const { postJsonBeacon } = vi.hoisted(() => ({ postJsonBeacon: vi.fn() }));
vi.mock('@/lib/tracking/json-beacon', () => ({ postJsonBeacon }));
vi.mock('@/lib/analytics', () => {
  throw new Error('analytics unavailable');
});

import { resetFunnelClockForTests } from '@/lib/analytics/signup-funnel-client';
import { trackHomepageEvent } from './homepage-analytics';

beforeEach(() => {
  postJsonBeacon.mockReset();
  resetFunnelClockForTests();
});

afterEach(() => resetFunnelClockForTests());

describe('homepage first-party submit producer', () => {
  it('sends only the allowlisted CTA fields before an unavailable analytics import', async () => {
    expect(
      trackHomepageEvent('homepage_prompt_submitted', {
        prompt: 'private prompt',
        email: 'private@example.com',
        intentId: 'private-intent',
        cohort: 'customer',
        surface: 'mobile_fullpage',
      })
    ).toBeUndefined();
    expect(postJsonBeacon).toHaveBeenCalledExactlyOnceWith(
      '/api/journey/step',
      {
        funnel: 'artist_signup',
        step: 'cta_click',
        surface: 'homepage',
      }
    );
    await vi.dynamicImportSettled();
    expect(postJsonBeacon).toHaveBeenCalledTimes(1);
  });

  it.each([
    'homepage_viewed',
    'homepage_prompt_edited',
    'homepage_pill_clicked',
  ])('does not turn %s into a CTA', async event => {
    trackHomepageEvent(event);
    await vi.dynamicImportSettled();
    expect(postJsonBeacon).not.toHaveBeenCalled();
  });

  it('never throws when the first-party transport and lazy analytics fail', async () => {
    postJsonBeacon.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => trackHomepageEvent('homepage_prompt_submitted')).not.toThrow();
    await vi.dynamicImportSettled();
  });
});
