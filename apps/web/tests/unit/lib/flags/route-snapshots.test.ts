import { describe, expect, it } from 'vitest';

import { APP_ROUTES } from '@/constants/routes';
import {
  resolveAppShellRouteFlagNames,
  resolveAuthRouteFlagNames,
  resolveOnboardingRouteFlagNames,
  resolveStartRouteFlagNames,
} from '@/lib/flags/route-snapshots';

describe('route flag snapshots', () => {
  it('keeps auth routes to the design shell flag only', () => {
    expect(resolveAuthRouteFlagNames()).toEqual(['DESIGN_V1']);
  });

  it('keeps onboarding and start routes to chat instrumentation only', () => {
    expect(resolveOnboardingRouteFlagNames()).toEqual(['CHAT_JANK_MONITOR']);
    expect(resolveStartRouteFlagNames()).toEqual(['CHAT_JANK_MONITOR']);
  });

  it('includes shell chrome flags for every app-shell route', () => {
    for (const pathname of [
      APP_ROUTES.CHAT,
      APP_ROUTES.RELEASES,
      APP_ROUTES.SETTINGS,
      APP_ROUTES.ADMIN,
      APP_ROUTES.FEATURE_FLAGS,
    ]) {
      expect(resolveAppShellRouteFlagNames(pathname)).toEqual(
        expect.arrayContaining([
          'DESIGN_V1',
          'STRIPE_CONNECT_ENABLED',
          'INBOX_HOME',
        ])
      );
    }
  });

  it('adds route-specific flags only where client consumers need them', () => {
    expect(resolveAppShellRouteFlagNames(APP_ROUTES.CHAT)).toEqual(
      expect.arrayContaining(['CHAT_JANK_MONITOR', 'APPLE_WALLET_PROFILE_PASS'])
    );
    expect(resolveAppShellRouteFlagNames(APP_ROUTES.CHAT)).not.toContain(
      'ALBUM_ART_GENERATION'
    );

    expect(resolveAppShellRouteFlagNames(APP_ROUTES.RELEASES)).toEqual(
      expect.arrayContaining(['ALBUM_ART_GENERATION'])
    );
    expect(resolveAppShellRouteFlagNames(APP_ROUTES.RELEASES)).not.toContain(
      'CHAT_JANK_MONITOR'
    );

    expect(
      resolveAppShellRouteFlagNames(APP_ROUTES.DASHBOARD_RELEASE_PLAN)
    ).toEqual(expect.arrayContaining(['RELEASE_PLAN_DEMO']));

    expect(resolveAppShellRouteFlagNames(APP_ROUTES.DASHBOARD_PROFILE)).toEqual(
      expect.arrayContaining(['CHAT_JANK_MONITOR'])
    );

    expect(
      resolveAppShellRouteFlagNames(APP_ROUTES.SETTINGS_ARTIST_PROFILE)
    ).toEqual(expect.arrayContaining(['APPLE_WALLET_PROFILE_PASS']));
  });

  it('does not include unrelated runtime flags in trimmed shell payloads', () => {
    const chatFlags = resolveAppShellRouteFlagNames(APP_ROUTES.CHAT);

    expect(chatFlags).not.toContain('MERCH_MVP');
    expect(chatFlags).not.toContain('AI_CONNECTORS_BETA');
    expect(chatFlags).not.toContain('PLAYLIST_ENGINE');
    expect(chatFlags).not.toContain('BULK_PRESS_PHOTO_IMPORT');
  });
});
