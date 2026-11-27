import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROFILE_MODE_ALIAS_MARKER } from '@/lib/render-fixture-policy';
import { aliasBudgetProfileModeParams } from '@/lib/routing/alias-budget-static-params';

// JOV-13104: the prerender decision is single-sourced from the generated set
// the pre-build script writes (and the proxy bounds the ?mode= rewrite to).
// The mocked module uses a getter so each test controls the set per call.
const prerenderedState = vi.hoisted(() => ({ keys: [] as string[] }));

vi.mock('@/lib/routing/generated/profile-mode-prerender-set', () => ({
  get PROFILE_MODE_PRERENDERED_KEYS() {
    return prerenderedState.keys;
  },
}));

// Keep the transitive services import inert: getProfileStaticParams (the
// canonical [username] prerender) still reads profiles through this module.
vi.mock('@/lib/services/profile/queries', () => ({
  getProfilesByUsernames: vi.fn(),
  getTopProfilesForStaticGeneration: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

const { getProfileModeRenderStaticParams } = await import(
  '@/app/[username]/_lib/profile-static-params'
);

describe('getProfileModeRenderStaticParams', () => {
  beforeEach(() => {
    prerenderedState.keys = [];
  });

  it('prerenders exactly the generated prerender set, in alias-budget order', async () => {
    prerenderedState.keys = ['testartist:pay', 'dualipa:listen'];

    expect(getProfileModeRenderStaticParams()).toEqual([
      {
        username: 'dualipa',
        profileMode: 'listen',
        marker: PROFILE_MODE_ALIAS_MARKER,
      },
      {
        username: 'testartist',
        profileMode: 'pay',
        marker: PROFILE_MODE_ALIAS_MARKER,
      },
    ]);
    expect(PROFILE_MODE_ALIAS_MARKER).toBe('__profile-mode-alias');
  });

  it('prerenders nothing when the build database had no public pairs', () => {
    prerenderedState.keys = [];

    expect(getProfileModeRenderStaticParams()).toEqual([]);
  });

  it('ignores generated keys outside the alias budget', () => {
    // A drifting script (or hand-edited generated file) must not smuggle
    // pairs into the prerender that the budget does not carry — the route
    // and the rewrite stay locked to aliasBudgetProfileModeParams.
    prerenderedState.keys = [
      'someoneelse:pay',
      'dualipa:not-a-budget-mode',
      'dualipa:tour',
    ];

    expect(getProfileModeRenderStaticParams()).toEqual([
      {
        username: 'dualipa',
        profileMode: 'tour',
        marker: PROFILE_MODE_ALIAS_MARKER,
      },
    ]);
  });

  it('prerenders every budget pair when the generated set carries the full budget', () => {
    prerenderedState.keys = [
      'dualipa:listen',
      'dualipa:subscribe',
      'dualipa:releases',
      'dualipa:tour',
      'testartist:pay',
    ];

    expect(getProfileModeRenderStaticParams()).toEqual(
      aliasBudgetProfileModeParams()
    );
  });
});
