import { describe, expect, it } from 'vitest';
import {
  isAdminShellRoute,
  isAudienceShellRoute,
  isCalendarShellRoute,
  isChatShellRoute,
  isInsightsShellRoute,
  isLibraryShellRoute,
  isLyricsShellRoute,
  isOvShellRoute,
  isPresenceShellRoute,
  isProfileShellRoute,
  isReleasesShellRoute,
  isSettingsShellRoute,
  isTasksShellRoute,
  isThreadsShellRoute,
  isTouringShellRoute,
  resolveAppShellRequestPath,
  resolveDashboardSegmentSkeletonVariant,
  shouldRedirectToOnboarding,
  shouldUseEssentialShellData,
} from '@/app/app/(shell)/shell-route-matches';
import { APP_ROUTES } from '@/constants/routes';

describe('resolveAppShellRequestPath', () => {
  it('uses next-url when it is available', () => {
    expect(
      resolveAppShellRequestPath(
        '/app/dashboard/releases?tab=links',
        '/app/dashboard'
      )
    ).toBe('/app/dashboard/releases');
  });

  it('falls back to x-matched-path when next-url is missing', () => {
    expect(resolveAppShellRequestPath(null, '/app/dashboard/releases')).toBe(
      '/app/dashboard/releases'
    );
  });

  it('strips route groups from x-matched-path when they are present', () => {
    expect(
      resolveAppShellRequestPath(null, '/app/(shell)/dashboard/releases')
    ).toBe('/app/dashboard/releases');
  });

  it('accepts absolute header values', () => {
    expect(
      resolveAppShellRequestPath(
        null,
        'https://jov.ie/app/dashboard/releases?tab=links'
      )
    ).toBe('/app/dashboard/releases');
  });

  it('falls back to the dashboard path when no path-like header is present', () => {
    expect(resolveAppShellRequestPath(null, null)).toBe(APP_ROUTES.DASHBOARD);
  });

  it('keeps loading route selection neutral when request headers are absent', () => {
    expect(resolveAppShellLoadingPath(null, null)).toBeNull();
  });
});

describe('isReleasesShellRoute', () => {
  it('matches the canonical releases route', () => {
    expect(isReleasesShellRoute(APP_ROUTES.RELEASES)).toBe(true);
  });

  it('matches the releases dashboard route', () => {
    expect(isReleasesShellRoute('/app/dashboard/releases')).toBe(true);
  });

  it('matches nested releases subroutes', () => {
    expect(isReleasesShellRoute('/app/releases/abc/tasks')).toBe(true);
    expect(isReleasesShellRoute('/app/dashboard/releases/abc/tasks')).toBe(
      true
    );
  });
});

describe('isChatShellRoute', () => {
  it('matches the dashboard root', () => {
    expect(isChatShellRoute(APP_ROUTES.DASHBOARD)).toBe(true);
  });

  it('matches the chat route', () => {
    expect(isChatShellRoute(APP_ROUTES.CHAT)).toBe(true);
  });

  it('matches chat thread subroutes', () => {
    expect(isChatShellRoute(`${APP_ROUTES.CHAT}/thread-abc`)).toBe(true);
  });

  it('matches the all chats route', () => {
    expect(isChatShellRoute(APP_ROUTES.CHATS)).toBe(true);
    expect(isChatShellRoute(APP_ROUTES.THREADS)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isChatShellRoute(null)).toBe(false);
  });

  it('returns false for non-chat routes', () => {
    expect(isChatShellRoute('/app/settings')).toBe(false);
  });
});

describe('isLyricsShellRoute', () => {
  it('matches the lyrics route', () => {
    expect(isLyricsShellRoute(APP_ROUTES.LYRICS)).toBe(true);
  });

  it('matches lyrics track subroutes', () => {
    expect(isLyricsShellRoute(`${APP_ROUTES.LYRICS}/track-abc`)).toBe(true);
  });
});

describe('isLibraryShellRoute', () => {
  it('matches the production library route', () => {
    expect(isLibraryShellRoute(APP_ROUTES.LIBRARY)).toBe(true);
  });

  it('matches the legacy dashboard library redirect route', () => {
    expect(isLibraryShellRoute(APP_ROUTES.LEGACY_DASHBOARD_LIBRARY)).toBe(true);
    expect(isLibraryShellRoute(APP_ROUTES.DASHBOARD_LIBRARY)).toBe(true);
  });
});

describe('isThreadsShellRoute', () => {
  it('matches the canonical chats route and legacy threads route', () => {
    expect(isThreadsShellRoute(APP_ROUTES.CHATS)).toBe(true);
    expect(isThreadsShellRoute(APP_ROUTES.THREADS)).toBe(true);
  });

  it('matches nested chats and legacy threads subroutes', () => {
    expect(isThreadsShellRoute(`${APP_ROUTES.CHATS}/recent`)).toBe(true);
    expect(isThreadsShellRoute(`${APP_ROUTES.THREADS}/recent`)).toBe(true);
  });
});

describe('isTasksShellRoute', () => {
  it('matches the dashboard tasks route', () => {
    expect(isTasksShellRoute(APP_ROUTES.DASHBOARD_TASKS)).toBe(true);
    expect(isTasksShellRoute(APP_ROUTES.TASKS)).toBe(true);
  });

  it('matches nested task subroutes', () => {
    expect(isTasksShellRoute(`${APP_ROUTES.TASKS}/task-abc`)).toBe(true);
    expect(isTasksShellRoute(`${APP_ROUTES.DASHBOARD_TASKS}/task-abc`)).toBe(
      true
    );
  });
});

describe('isInsightsShellRoute', () => {
  it('matches the canonical insights route', () => {
    expect(isInsightsShellRoute(APP_ROUTES.INSIGHTS)).toBe(true);
  });

  it('matches nested insights subroutes', () => {
    expect(isInsightsShellRoute(`${APP_ROUTES.INSIGHTS}/priority/high`)).toBe(
      true
    );
  });

  it('matches the legacy dashboard insights redirect route', () => {
    expect(
      isInsightsShellRoute(`${APP_ROUTES.LEGACY_DASHBOARD}/insights`)
    ).toBe(true);
  });
});

describe('remaining route-shaped shell skeleton matchers', () => {
  it('matches the full admin subtree without matching settings admin', () => {
    expect(isAdminShellRoute(APP_ROUTES.ADMIN)).toBe(true);
    expect(isAdminShellRoute(APP_ROUTES.ADMIN_ACTIVITY)).toBe(true);
    expect(isAdminShellRoute(APP_ROUTES.SETTINGS_ADMIN)).toBe(false);
  });

  it('matches the canonical profiles workspace only', () => {
    expect(isProfileShellRoute(APP_ROUTES.PROFILES)).toBe(true);
    expect(isProfileShellRoute(APP_ROUTES.DASHBOARD_PROFILE)).toBe(false);
    expect(isProfileShellRoute(`${APP_ROUTES.DASHBOARD}/profile`)).toBe(false);
    expect(isProfileShellRoute(APP_ROUTES.SETTINGS_ARTIST_PROFILE)).toBe(false);
  });

  it('matches canonical and legacy tour workspaces without claiming touring settings', () => {
    expect(isTouringShellRoute(APP_ROUTES.TOUR_DATES)).toBe(true);
    expect(isTouringShellRoute(APP_ROUTES.DASHBOARD_TOUR_DATES)).toBe(true);
    expect(isTouringShellRoute(APP_ROUTES.SETTINGS_TOURING)).toBe(false);
    expect(isTouringShellRoute(APP_ROUTES.CALENDAR)).toBe(false);
  });
});

describe('resolveDashboardSegmentSkeletonVariant', () => {
  it.each([
    [APP_ROUTES.ADMIN_ACTIVITY, 'admin'],
    [APP_ROUTES.INSIGHTS, 'insights'],
    [`${APP_ROUTES.LEGACY_DASHBOARD}/insights`, 'insights'],
    [APP_ROUTES.PROFILES, 'profile'],
    [APP_ROUTES.DASHBOARD_PROFILE, 'default'],
    [APP_ROUTES.TOUR_DATES, 'tour'],
    [APP_ROUTES.DASHBOARD_TOUR_DATES, 'tour'],
    [APP_ROUTES.SETTINGS_TOURING, 'default'],
    [APP_ROUTES.EARNINGS, 'default'],
    [null, 'default'],
  ] as const)('resolves %s to %s', (pathname, expected) => {
    expect(resolveDashboardSegmentSkeletonVariant(pathname)).toBe(expected);
  });

  it('keeps touring settings out of the tour workspace family', () => {
    expect(isSettingsShellRoute(APP_ROUTES.SETTINGS_TOURING)).toBe(true);
    expect(isTouringShellRoute(APP_ROUTES.SETTINGS_TOURING)).toBe(false);
    expect(
      resolveDashboardSegmentSkeletonVariant(APP_ROUTES.SETTINGS_TOURING)
    ).toBe('default');
  });
});

describe('isPresenceShellRoute', () => {
  it('matches the canonical presence route', () => {
    expect(isPresenceShellRoute(APP_ROUTES.PRESENCE)).toBe(true);
  });

  it('matches nested presence subroutes', () => {
    expect(isPresenceShellRoute(`${APP_ROUTES.PRESENCE}/platforms`)).toBe(true);
  });
});

describe('isAudienceShellRoute', () => {
  it('matches the canonical audience route', () => {
    expect(isAudienceShellRoute(APP_ROUTES.AUDIENCE)).toBe(true);
  });

  it('matches the legacy dashboard audience route', () => {
    expect(isAudienceShellRoute(APP_ROUTES.DASHBOARD_AUDIENCE)).toBe(true);
  });

  it('matches nested audience subroutes', () => {
    expect(isAudienceShellRoute(`${APP_ROUTES.AUDIENCE}/segments`)).toBe(true);
    expect(
      isAudienceShellRoute(`${APP_ROUTES.DASHBOARD_AUDIENCE}/segments`)
    ).toBe(true);
  });
});

describe('isCalendarShellRoute', () => {
  it('matches the canonical calendar route', () => {
    expect(isCalendarShellRoute(APP_ROUTES.CALENDAR)).toBe(true);
  });

  it('matches nested calendar subroutes', () => {
    expect(isCalendarShellRoute(`${APP_ROUTES.CALENDAR}/week/2026-05-15`)).toBe(
      true
    );
  });
});

describe('isOvShellRoute', () => {
  it('matches the OV root and nested internal routes only', () => {
    expect(isOvShellRoute(APP_ROUTES.OV)).toBe(true);
    expect(isOvShellRoute(APP_ROUTES.ADMIN_OPS)).toBe(true);
    expect(isOvShellRoute(APP_ROUTES.DASHBOARD)).toBe(false);
  });
});

describe('isSettingsShellRoute', () => {
  it('matches the settings root and nested settings subroutes', () => {
    expect(isSettingsShellRoute(APP_ROUTES.SETTINGS)).toBe(true);
    expect(isSettingsShellRoute(APP_ROUTES.SETTINGS_ACCOUNT)).toBe(true);
  });

  it('returns false for non-settings routes', () => {
    expect(isSettingsShellRoute(APP_ROUTES.AUDIENCE)).toBe(false);
    expect(isSettingsShellRoute(null)).toBe(false);
  });
});

describe('shouldUseEssentialShellData', () => {
  it('returns true for chat routes', () => {
    expect(shouldUseEssentialShellData(APP_ROUTES.CHAT)).toBe(true);
    expect(shouldUseEssentialShellData(APP_ROUTES.THREADS)).toBe(true);
  });

  it('returns true for releases routes', () => {
    expect(shouldUseEssentialShellData('/app/dashboard/releases')).toBe(true);
  });

  it('returns true for lyrics, library, and tasks routes', () => {
    expect(shouldUseEssentialShellData(APP_ROUTES.LYRICS)).toBe(true);
    expect(shouldUseEssentialShellData(APP_ROUTES.LIBRARY)).toBe(true);
    expect(shouldUseEssentialShellData(APP_ROUTES.TASKS)).toBe(true);
    expect(shouldUseEssentialShellData(APP_ROUTES.DASHBOARD_TASKS)).toBe(true);
  });

  it('returns true for the canonical insights route', () => {
    expect(shouldUseEssentialShellData(APP_ROUTES.INSIGHTS)).toBe(true);
  });

  it('returns true for the canonical presence route', () => {
    expect(shouldUseEssentialShellData(APP_ROUTES.PRESENCE)).toBe(true);
  });

  it('returns true for audience routes that own their page data', () => {
    expect(shouldUseEssentialShellData(APP_ROUTES.AUDIENCE)).toBe(true);
    expect(shouldUseEssentialShellData(APP_ROUTES.DASHBOARD_AUDIENCE)).toBe(
      true
    );
  });

  it('returns true for the canonical calendar route', () => {
    expect(shouldUseEssentialShellData(APP_ROUTES.CALENDAR)).toBe(true);
  });

  it('returns true for dashboard root', () => {
    expect(shouldUseEssentialShellData(APP_ROUTES.DASHBOARD)).toBe(true);
  });

  it('uses essential shell data for OV routes', () => {
    expect(shouldUseEssentialShellData(APP_ROUTES.OV)).toBe(true);
    expect(shouldUseEssentialShellData(APP_ROUTES.ADMIN_OPS)).toBe(true);
  });

  it('does not treat the legacy dashboard root as a nested dashboard subroute', () => {
    expect(shouldUseEssentialShellData(APP_ROUTES.LEGACY_DASHBOARD)).toBe(
      false
    );
  });

  it('returns true for settings routes that do not need supplementary dashboard data', () => {
    expect(shouldUseEssentialShellData(APP_ROUTES.SETTINGS_ACCOUNT)).toBe(true);
    expect(shouldUseEssentialShellData(APP_ROUTES.SETTINGS_CONTACTS)).toBe(
      true
    );
    expect(shouldUseEssentialShellData(APP_ROUTES.SETTINGS_TOURING)).toBe(true);
  });

  it('returns true for artist profile settings after its page owns supplementary data', () => {
    expect(
      shouldUseEssentialShellData(APP_ROUTES.SETTINGS_ARTIST_PROFILE)
    ).toBe(true);
  });

  it('returns false for null', () => {
    expect(shouldUseEssentialShellData(null)).toBe(false);
  });
});

describe('shouldRedirectToOnboarding', () => {
  it('returns true for lightweight shell routes', () => {
    expect(shouldRedirectToOnboarding(APP_ROUTES.CHAT)).toBe(true);
    expect(shouldRedirectToOnboarding(APP_ROUTES.CHATS)).toBe(true);
    expect(shouldRedirectToOnboarding(APP_ROUTES.THREADS)).toBe(true);
    expect(shouldRedirectToOnboarding('/app/dashboard/releases')).toBe(true);
    expect(shouldRedirectToOnboarding(APP_ROUTES.LYRICS)).toBe(true);
    expect(shouldRedirectToOnboarding(APP_ROUTES.LIBRARY)).toBe(true);
    expect(shouldRedirectToOnboarding(APP_ROUTES.TASKS)).toBe(true);
    expect(shouldRedirectToOnboarding(APP_ROUTES.DASHBOARD_TASKS)).toBe(true);
    expect(shouldRedirectToOnboarding(APP_ROUTES.INSIGHTS)).toBe(true);
    expect(shouldRedirectToOnboarding(APP_ROUTES.PRESENCE)).toBe(true);
    expect(shouldRedirectToOnboarding(APP_ROUTES.AUDIENCE)).toBe(true);
    expect(shouldRedirectToOnboarding(APP_ROUTES.CALENDAR)).toBe(true);
  });

  it('does not add onboarding redirects to the legacy dashboard root', () => {
    expect(shouldRedirectToOnboarding(APP_ROUTES.LEGACY_DASHBOARD)).toBe(false);
  });

  it('does not add onboarding redirects to settings route chrome optimization', () => {
    expect(shouldRedirectToOnboarding(APP_ROUTES.SETTINGS_CONTACTS)).toBe(
      false
    );
  });

  it('returns false for null', () => {
    expect(shouldRedirectToOnboarding(null)).toBe(false);
  });
});

describe('shell foundation Wave 3 — route persistence + request budgets (no full reload / blank frame on warm nav)', () => {
  it('lightweight shell routes (chat, chats, releases, library, tasks, etc.) use essential shell data for minimal request count and stable HydrateClient root', () => {
    // These routes return true → getDashboardShellData only (no full dashboardData)
    // Combined with always-on HydrateClient in DashboardShellContent, guarantees
    // AppShellFrame / sidebar / audio / header chrome do not remount on client nav.
    // Sidebar collapsed state (cookie), audio playback, and focus all persist.
    expect(shouldUseEssentialShellData(APP_ROUTES.CHAT)).toBe(true);
    expect(shouldUseEssentialShellData(APP_ROUTES.CHATS)).toBe(true);
    expect(shouldUseEssentialShellData(APP_ROUTES.THREADS)).toBe(true);
    expect(shouldUseEssentialShellData('/app/dashboard/releases')).toBe(true);
    expect(shouldUseEssentialShellData(APP_ROUTES.LIBRARY)).toBe(true);
    expect(shouldUseEssentialShellData(APP_ROUTES.TASKS)).toBe(true);
    expect(shouldUseEssentialShellData(APP_ROUTES.LYRICS + '/123')).toBe(true);
    expect(shouldUseEssentialShellData(APP_ROUTES.SETTINGS_ACCOUNT)).toBe(true);
  });

  it('full-data routes (earnings etc) correctly opt out of essential to preserve request budget semantics', () => {
    // Non-essential still hydrate inside the *same* stable HydrateClient + AuthShellWrapper tree.
    expect(shouldUseEssentialShellData(APP_ROUTES.EARNINGS)).toBe(false);
  });
});
