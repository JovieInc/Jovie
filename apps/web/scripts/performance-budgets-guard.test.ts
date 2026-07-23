import type { Page } from '@playwright/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const playwrightMocks = vi.hoisted(() => ({
  browserClose: vi.fn(),
  chromiumLaunch: vi.fn(),
}));

vi.mock('@playwright/test', () => ({
  chromium: {
    launch: playwrightMocks.chromiumLaunch,
  },
}));

import {
  loadGuardManifestRoutes,
  parseGuardCliArgs,
  runPerformanceBudgetsGuard,
  selectGuardRoutes,
  waitForWarmDestinationReady,
} from './performance-budgets-guard';
import type { PerfRouteDefinition } from './performance-route-manifest';

describe('performance budgets guard', () => {
  beforeEach(() => {
    playwrightMocks.browserClose.mockReset();
    playwrightMocks.chromiumLaunch.mockReset();
    playwrightMocks.chromiumLaunch.mockResolvedValue({
      close: playwrightMocks.browserClose,
    });
  });

  it('parses group and route-id selectors from the CLI', () => {
    const parsed = parseGuardCliArgs([
      '--group',
      'public-profile-core',
      '--route-id',
      'home',
      '--base-url',
      'http://127.0.0.1:4100',
    ]);

    expect(parsed.groupIds).toEqual(['public-profile-core']);
    expect(parsed.routeIds).toEqual(['home']);
    expect(parsed.baseUrl).toBe('http://127.0.0.1:4100');
  });

  it('selects grouped routes from the manifest without loading unrelated surfaces', async () => {
    const routes = await loadGuardManifestRoutes();
    const selected = selectGuardRoutes(
      routes,
      parseGuardCliArgs(['--group', 'creator-shell'])
    );

    expect(selected.length).toBeGreaterThan(1);
    expect(selected.every(route => route.group === 'creator-shell')).toBe(true);
    expect(selected.some(route => route.id === 'creator-releases')).toBe(true);
  });

  it('selects manifest routes by route id even when the path contains placeholders', async () => {
    const routes = await loadGuardManifestRoutes();
    const selected = selectGuardRoutes(
      routes,
      parseGuardCliArgs(['--route-id', 'onboarding-resume-spotify'])
    );

    expect(selected.map(route => route.id)).toEqual([
      'onboarding-resume-spotify',
    ]);
    expect(selected[0]?.path).toContain('resume=spotify');
  });

  it('fails before browser measurement when a manifest has an empty nav locator', async () => {
    await expect(
      loadGuardManifestRoutes(
        'apps/web/scripts/fixtures/performance-route-manifest.invalid.fixture.ts'
      )
    ).rejects.toThrow(
      'invalid-warm-nav-fixture" has an empty navTrigger selector at index 0'
    );
  });

  it('fails loudly when an authenticated route is measured without auth state', async () => {
    await expect(
      runPerformanceBudgetsGuard({
        authPath: '.context/perf/auth/does-not-exist.json',
        baseUrl: 'http://127.0.0.1:4100',
        groupIds: [],
        json: true,
        manifestPath: undefined,
        paths: [],
        routeIds: ['creator-chat'],
        runs: 3,
      })
    ).rejects.toThrow('requires auth');

    expect(playwrightMocks.chromiumLaunch).toHaveBeenCalledOnce();
    expect(playwrightMocks.browserClose).toHaveBeenCalledOnce();
  });

  it('does not pass a stalled warm destination from a persistent source shell', async () => {
    const queriedSelectors: string[] = [];
    const route = {
      id: 'stalled-destination',
      readySelectors: {
        shell: ['[data-testid="persistent-shell"]'],
        content: ['[data-testid="destination-content"]'],
      },
    } as PerfRouteDefinition;
    const page = {
      locator: vi.fn((selector: string) => {
        queriedSelectors.push(selector);
        return {
          count: vi.fn().mockResolvedValue(1),
          nth: vi.fn(() => ({
            isVisible: vi.fn().mockResolvedValue(false),
          })),
        };
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    await expect(
      waitForWarmDestinationReady(page, route, Date.now(), false, 10)
    ).rejects.toThrow('destination-content');

    expect(queriedSelectors).toContain('[data-testid="destination-content"]');
    expect(queriedSelectors).not.toContain('[data-testid="persistent-shell"]');
  });
});
