import { describe, expect, it } from 'vitest';
import {
  assertValidPerfRouteDefinition,
  getEndUserPerfRouteById,
  type PerfRouteDefinition,
} from './performance-route-manifest';

describe('alias usable-result route validation', () => {
  const route = getEndUserPerfRouteById('public-profile-listen')!;

  it.each(['listen', 'music', 'subscribe', 'tip', 'tour', 'releases'])(
    'accepts the %s alias without pinning the visitor viewport',
    alias => {
      const candidate = getEndUserPerfRouteById(`public-profile-${alias}`)!;
      expect(candidate.viewport).toBeUndefined();
      expect(() => assertValidPerfRouteDefinition(candidate)).not.toThrow();
    }
  );

  it.each([
    {
      group: 'shell' as const,
      selector: '[data-testid="profile-header"]',
      error: 'visible profile header',
    },
    {
      group: 'shell' as const,
      selector: '[data-testid="profile-desktop-top-chrome"]',
      error: 'desktop top chrome',
    },
    {
      group: 'content' as const,
      selector:
        '[data-testid="profile-compact-shell"][data-interactive-ready="true"]',
      error: 'interactive compact shell',
    },
    {
      group: 'content' as const,
      selector:
        '[data-testid="profile-desktop-surface"][data-interactive-ready="true"]',
      error: 'interactive desktop surface',
    },
  ])('rejects aliases missing the $error', ({ group, selector, error }) => {
    expect(() =>
      assertValidPerfRouteDefinition({
        ...route,
        readySelectors: {
          ...route.readySelectors,
          [group]: route.readySelectors[group]!.filter(
            candidate => candidate !== selector
          ),
        },
      })
    ).toThrow(error);
  });

  it.each([
    { patch: { surface: 'marketing' }, error: 'public-profile redirect' },
    { patch: { measureMode: 'page-load' }, error: 'public-profile redirect' },
    {
      patch: {
        timingBudgets: [{ metric: 'usable-alias-result', budget: 1001 }],
      },
      error: '1000ms median budget',
    },
    {
      patch: {
        timingBudgets: [
          { metric: 'usable-alias-result', budget: 1000 },
          { metric: 'redirect-complete', budget: 1000 },
        ],
      },
      error: 'must not claim redirect-complete timing',
    },
    {
      patch: {
        aliasUsableResult: {
          canonicalPath: '/[username]?mode=listen',
          destinationAffordances: [],
        },
      },
      error: 'must require a destination affordance',
    },
  ] satisfies readonly {
    patch: Partial<PerfRouteDefinition>;
    error: string;
  }[])('rejects aliases that violate $error', ({ patch, error }) => {
    expect(() =>
      assertValidPerfRouteDefinition({ ...route, ...patch })
    ).toThrow(error);
  });
});
