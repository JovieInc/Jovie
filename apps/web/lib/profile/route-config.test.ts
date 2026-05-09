/**
 * Unit tests for apps/web/lib/profile/route-config.ts
 *
 * Spec: docs/public-profile-surface-spec.md §1, §2
 */

import { describe, expect, it } from 'vitest';
import {
  BOTTOM_TAB_KEYS,
  categoryShowsTabBar,
  getProfileRouteConfig,
  getRouteConfigForMode,
  PROFILE_ROUTE_CONFIG,
  type ProfileRouteKey,
  REDIRECT_SINK_ROUTE_KEYS,
  resolveActiveTab,
  TOP_LEVEL_ROUTE_KEYS,
} from './route-config';

// ---------------------------------------------------------------------------
// Registry completeness
// ---------------------------------------------------------------------------

describe('PROFILE_ROUTE_CONFIG', () => {
  it('contains at least one entry for each category', () => {
    const entries = Object.values(PROFILE_ROUTE_CONFIG);
    const categories = new Set(entries.map(e => e.category));
    expect(categories).toContain('top-level');
    expect(categories).toContain('secondary');
    expect(categories).toContain('external-action');
    expect(categories).toContain('redirect-sink');
    expect(categories).toContain('system');
  });

  it('every entry has a matching key field', () => {
    for (const [k, entry] of Object.entries(PROFILE_ROUTE_CONFIG)) {
      expect(entry.key).toBe(k);
    }
  });

  it('top-level routes all have showBottomTabBar = true', () => {
    for (const entry of Object.values(PROFILE_ROUTE_CONFIG)) {
      if (entry.category === 'top-level') {
        expect(entry.showBottomTabBar, `${entry.key} should show tab bar`).toBe(
          true
        );
      }
    }
  });

  it('non-top-level routes all have showBottomTabBar = false', () => {
    for (const entry of Object.values(PROFILE_ROUTE_CONFIG)) {
      if (entry.category !== 'top-level') {
        expect(
          entry.showBottomTabBar,
          `${entry.key} should not show tab bar`
        ).toBe(false);
      }
    }
  });

  it('top-level routes all have a non-null activeTab', () => {
    for (const entry of Object.values(PROFILE_ROUTE_CONFIG)) {
      if (entry.category === 'top-level') {
        expect(entry.activeTab, `${entry.key} needs activeTab`).not.toBeNull();
      }
    }
  });

  it('non-top-level routes all have activeTab = null', () => {
    for (const entry of Object.values(PROFILE_ROUTE_CONFIG)) {
      if (entry.category !== 'top-level') {
        expect(
          entry.activeTab,
          `${entry.key} should have null activeTab`
        ).toBeNull();
      }
    }
  });

  it('every activeTab value is a valid BOTTOM_TAB_KEY', () => {
    const validTabs = new Set<string>(BOTTOM_TAB_KEYS);
    for (const entry of Object.values(PROFILE_ROUTE_CONFIG)) {
      if (entry.activeTab !== null) {
        expect(
          validTabs.has(entry.activeTab),
          `${entry.key} activeTab "${entry.activeTab}" is not a valid bottom tab`
        ).toBe(true);
      }
    }
  });

  it('all analyticsSurface values are non-empty strings', () => {
    for (const entry of Object.values(PROFILE_ROUTE_CONFIG)) {
      expect(typeof entry.analyticsSurface).toBe('string');
      expect(entry.analyticsSurface.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Tab bar visibility rules (spec §2.2)
// ---------------------------------------------------------------------------

describe('categoryShowsTabBar', () => {
  it('returns true for top-level', () => {
    expect(categoryShowsTabBar('top-level')).toBe(true);
  });

  it('returns false for secondary', () => {
    expect(categoryShowsTabBar('secondary')).toBe(false);
  });

  it('returns false for external-action', () => {
    expect(categoryShowsTabBar('external-action')).toBe(false);
  });

  it('returns false for redirect-sink', () => {
    expect(categoryShowsTabBar('redirect-sink')).toBe(false);
  });

  it('returns false for system', () => {
    expect(categoryShowsTabBar('system')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Route resolution by key
// ---------------------------------------------------------------------------

describe('getProfileRouteConfig', () => {
  it('returns the config for a known key', () => {
    const config = getProfileRouteConfig('profile-root');
    expect(config.key).toBe('profile-root');
    expect(config.category).toBe('top-level');
    expect(config.activeTab).toBe('profile');
  });

  it('throws for an unknown key', () => {
    expect(() =>
      getProfileRouteConfig('does-not-exist' as ProfileRouteKey)
    ).toThrow(/Unknown route key/);
  });
});

// ---------------------------------------------------------------------------
// Route resolution by mode (spec §2.4)
// ---------------------------------------------------------------------------

describe('getRouteConfigForMode', () => {
  it('null/undefined → profile-root', () => {
    expect(getRouteConfigForMode(null).key).toBe('profile-root');
    expect(getRouteConfigForMode(undefined).key).toBe('profile-root');
    expect(getRouteConfigForMode('').key).toBe('profile-root');
  });

  it('"profile" → profile-root', () => {
    expect(getRouteConfigForMode('profile').key).toBe('profile-root');
  });

  it('"listen" → mode-listen with Music tab active', () => {
    const config = getRouteConfigForMode('listen');
    expect(config.key).toBe('mode-listen');
    expect(config.activeTab).toBe('listen');
    expect(config.showBottomTabBar).toBe(true);
  });

  it('"subscribe" → mode-subscribe with Alerts tab active', () => {
    const config = getRouteConfigForMode('subscribe');
    expect(config.key).toBe('mode-subscribe');
    expect(config.activeTab).toBe('subscribe');
  });

  it('"tour" → mode-tour with Events tab active', () => {
    const config = getRouteConfigForMode('tour');
    expect(config.key).toBe('mode-tour');
    expect(config.activeTab).toBe('tour');
  });

  it('"releases" → mode-releases with Music tab active (drawer overlay)', () => {
    const config = getRouteConfigForMode('releases');
    expect(config.key).toBe('mode-releases');
    expect(config.activeTab).toBe('listen');
  });

  it('"about" → mode-about with Home tab active (drawer overlay)', () => {
    const config = getRouteConfigForMode('about');
    expect(config.activeTab).toBe('profile');
  });

  it('"contact" → mode-contact with Home tab active (drawer overlay)', () => {
    const config = getRouteConfigForMode('contact');
    expect(config.activeTab).toBe('profile');
  });

  it('"pay" → mode-pay with Home tab active (drawer overlay)', () => {
    const config = getRouteConfigForMode('pay');
    expect(config.activeTab).toBe('profile');
  });

  it('"tip" → mode-pay (legacy alias)', () => {
    const config = getRouteConfigForMode('tip');
    expect(config.key).toBe('mode-pay');
    expect(config.profileMode).toBe('pay');
  });

  it('unknown mode → profile-root fallback', () => {
    expect(getRouteConfigForMode('invalid-garbage').key).toBe('profile-root');
  });
});

// ---------------------------------------------------------------------------
// Active tab resolution with tour-dates guard (spec §2.3 + §2.4)
// ---------------------------------------------------------------------------

describe('resolveActiveTab', () => {
  it('profile mode → "profile" tab', () => {
    expect(resolveActiveTab('profile')).toBe('profile');
    expect(resolveActiveTab(null)).toBe('profile');
    expect(resolveActiveTab(undefined)).toBe('profile');
  });

  it('listen mode → "listen" tab', () => {
    expect(resolveActiveTab('listen')).toBe('listen');
  });

  it('subscribe mode → "subscribe" tab', () => {
    expect(resolveActiveTab('subscribe')).toBe('subscribe');
  });

  it('tour mode with hasTourDates=true → "tour" tab', () => {
    expect(resolveActiveTab('tour', { hasTourDates: true })).toBe('tour');
  });

  it('tour mode with hasTourDates=false → fallback to "profile" tab', () => {
    expect(resolveActiveTab('tour', { hasTourDates: false })).toBe('profile');
  });

  it('tour mode with no hasTourDates option → "tour" tab (defaults to true)', () => {
    expect(resolveActiveTab('tour')).toBe('tour');
  });

  it('releases mode → "listen" tab (drawer overlay keeps Music active)', () => {
    expect(resolveActiveTab('releases')).toBe('listen');
  });

  it('about mode → "profile" tab (drawer overlay keeps Home active)', () => {
    expect(resolveActiveTab('about')).toBe('profile');
  });

  it('pay mode → "profile" tab (drawer overlay keeps Home active)', () => {
    expect(resolveActiveTab('pay')).toBe('profile');
  });
});

// ---------------------------------------------------------------------------
// Path builders
// ---------------------------------------------------------------------------

describe('buildPath', () => {
  it('profile-root builds /{username}', () => {
    expect(PROFILE_ROUTE_CONFIG['profile-root'].buildPath('artist123')).toBe(
      '/artist123'
    );
  });

  it('mode-listen builds /{username}?mode=listen', () => {
    expect(PROFILE_ROUTE_CONFIG['mode-listen'].buildPath('artist123')).toBe(
      '/artist123?mode=listen'
    );
  });

  it('mode-subscribe builds /{username}?mode=subscribe', () => {
    expect(PROFILE_ROUTE_CONFIG['mode-subscribe'].buildPath('myartist')).toBe(
      '/myartist?mode=subscribe'
    );
  });

  it('alerts builds /{username}/alerts', () => {
    expect(PROFILE_ROUTE_CONFIG['alerts'].buildPath('myartist')).toBe(
      '/myartist/alerts'
    );
  });

  it('redirect-about builds /{username}/about', () => {
    expect(PROFILE_ROUTE_CONFIG['redirect-about'].buildPath('myartist')).toBe(
      '/myartist/about'
    );
  });

  it('content-smart-link builds /{username}/{slug}', () => {
    expect(
      PROFILE_ROUTE_CONFIG['content-smart-link'].buildPath(
        'myartist',
        'my-release'
      )
    ).toBe('/myartist/my-release');
  });
});

// ---------------------------------------------------------------------------
// Constant collections
// ---------------------------------------------------------------------------

describe('TOP_LEVEL_ROUTE_KEYS', () => {
  it('all keys exist in the registry', () => {
    for (const key of TOP_LEVEL_ROUTE_KEYS) {
      expect(PROFILE_ROUTE_CONFIG[key]).toBeDefined();
    }
  });

  it('all referenced entries are top-level category', () => {
    for (const key of TOP_LEVEL_ROUTE_KEYS) {
      expect(PROFILE_ROUTE_CONFIG[key].category).toBe('top-level');
    }
  });

  it('includes the four primary-tab mode entries', () => {
    expect(TOP_LEVEL_ROUTE_KEYS).toContain('profile-root');
    expect(TOP_LEVEL_ROUTE_KEYS).toContain('mode-listen');
    expect(TOP_LEVEL_ROUTE_KEYS).toContain('mode-tour');
    expect(TOP_LEVEL_ROUTE_KEYS).toContain('mode-subscribe');
  });
});

describe('REDIRECT_SINK_ROUTE_KEYS', () => {
  it('all keys exist in the registry', () => {
    for (const key of REDIRECT_SINK_ROUTE_KEYS) {
      expect(PROFILE_ROUTE_CONFIG[key]).toBeDefined();
    }
  });

  it('all referenced entries are redirect-sink category', () => {
    for (const key of REDIRECT_SINK_ROUTE_KEYS) {
      expect(PROFILE_ROUTE_CONFIG[key].category).toBe('redirect-sink');
    }
  });

  it('covers all seven canonical redirect sinks from spec §1.4', () => {
    const sinkModes = REDIRECT_SINK_ROUTE_KEYS.map(
      k => PROFILE_ROUTE_CONFIG[k].profileMode
    );
    expect(sinkModes).toContain('about');
    expect(sinkModes).toContain('contact');
    expect(sinkModes).toContain('listen');
    expect(sinkModes).toContain('pay');
    expect(sinkModes).toContain('releases');
    expect(sinkModes).toContain('subscribe');
    expect(sinkModes).toContain('tour');
  });
});

describe('BOTTOM_TAB_KEYS', () => {
  it('contains exactly four primary tab keys in spec order', () => {
    expect(BOTTOM_TAB_KEYS).toEqual(['profile', 'listen', 'tour', 'subscribe']);
  });
});
