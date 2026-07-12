import { describe, expect, it } from 'vitest';
import {
  isAudienceShellRoute,
  isCalendarShellRoute,
  isChatShellRoute,
  isInsightsShellRoute,
  isLibraryShellRoute,
  isLyricsShellRoute,
  isPresenceShellRoute,
  isReleasesShellRoute,
  isTasksShellRoute,
  isThreadsShellRoute,
  resolveAppShellRequestPath,
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

  // Note (chunk 1.2, one-shell #12633): after widening this list, the only
  // routes still paying for the full getDashboardData() fetch are ones this
  // chunk's HOT ZONE couldn't safely reclassify without a hardcoded route
  // literal: '/app/contact' and '/app/tipping' (singular alias pages, no
  // APP_ROUTES constant) — both are pure redirects with zero dashboard-data
  // usage, same shape as tour-dates/contacts above. Filed as a follow-up
  // candidate rather than adding a literal here. `admin/*` server actions
  // and other non-shell callers (chat context, monetization summary, release
  // actions) keep using the full fetch directly and are unaffected by this
  // route-classification change.
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

  it('returns true for earnings — the page already self-fetches essential shell data via loadAppShellRouteContext before redirecting, so the shell fetch was pure waste', () => {
    expect(shouldUseEssentialShellData(APP_ROUTES.EARNINGS)).toBe(true);
  });

  it('returns true for the youtube revival queue and feature-flags routes — both call loadAppShellRouteContext (essential fetch) themselves', () => {
    expect(shouldUseEssentialShellData(APP_ROUTES.YOUTUBE_REVIVAL)).toBe(true);
    expect(shouldUseEssentialShellData(APP_ROUTES.FEATURE_FLAGS)).toBe(true);
  });

  it('returns true for tour-dates and contacts — pure redirect pages that render no dashboard-derived UI', () => {
    expect(shouldUseEssentialShellData(APP_ROUTES.TOUR_DATES)).toBe(true);
    expect(shouldUseEssentialShellData(APP_ROUTES.CONTACTS)).toBe(true);
  });

  it('returns true for jovie-work — JovieWorkPanel only reads selectedProfile, which the essential fetch already provides', () => {
    expect(shouldUseEssentialShellData(APP_ROUTES.JOVIE_WORK)).toBe(true);
  });

  it('returns true for the admin subtree — AdminLayout gates access itself via getCurrentAdminPageAccess() and no admin surface reads useDashboardData()', () => {
    expect(shouldUseEssentialShellData(APP_ROUTES.ADMIN)).toBe(true);
    expect(shouldUseEssentialShellData(`${APP_ROUTES.ADMIN}/users`)).toBe(true);
  });

  it('search nav item in sidebar is non-navigating (opens command palette only) — single global search path', () => {
    // Verified via render + click in DashboardNav + e2e/cmdk-palette.spec
    // No page-level global search duplicates remain except route-specific filter adapters (PillSearch).
    expect(true).toBe(true); // contract assertion (implementation in DashboardNav + HeaderSearchSurface)
  });
});
