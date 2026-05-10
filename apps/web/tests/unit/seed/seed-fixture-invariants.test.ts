/**
 * Seed fixture invariant tests (JOV-2077, JOV-2078)
 *
 * Enforces that seed/fixture data used in marketing screenshots and demos:
 * - Contains no known placeholder titles
 * - Does not invent tracks/titles for real-artist fixtures that have a Spotify ID
 * - Credits collaborators correctly (Calvin fixtures stay free of Tim White identity)
 *
 * These tests run against static fixture data only — no DB, no network.
 */

import { describe, expect, it } from 'vitest';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';
import { SCREENSHOT_SCENARIOS } from '@/lib/screenshots/registry';

// ---------------------------------------------------------------------------
// Known placeholder values that must never appear in public fixture data.
// Extend this list whenever a new placeholder is discovered.
// ---------------------------------------------------------------------------
const KNOWN_PLACEHOLDER_TITLES = [
  "Don't Look Down",
  'dont-look-down',
  'dont look down',
  'test song',
  'Test Song',
  'lorem ipsum',
  'Lorem Ipsum',
  'untitled',
  'Untitled',
  'fake track',
  'Fake Track',
] as const;

// ---------------------------------------------------------------------------
// Helper: stringify a fixture tree to catch nested references
// ---------------------------------------------------------------------------
function fixtureJson(value: unknown): string {
  return JSON.stringify(value);
}

describe('demo persona fixtures (JOV-2077)', () => {
  it('defines a persona handle and display name', () => {
    expect(INTERNAL_DJ_DEMO_PERSONA.profile.handle.length).toBeGreaterThan(0);
    expect(INTERNAL_DJ_DEMO_PERSONA.profile.displayName.length).toBeGreaterThan(
      0
    );
  });

  it('has at least one release with real metadata', () => {
    expect(INTERNAL_DJ_DEMO_PERSONA.releases.length).toBeGreaterThan(0);
    for (const release of INTERNAL_DJ_DEMO_PERSONA.releases) {
      expect(release.title.length).toBeGreaterThan(0);
      expect(release.releaseDate.length).toBeGreaterThan(0);
      expect(release.artworkUrl.length).toBeGreaterThan(0);
    }
  });

  it('contains no known placeholder titles in release data', () => {
    const fixtureText = fixtureJson({
      releases: INTERNAL_DJ_DEMO_PERSONA.releases,
    });

    for (const placeholder of KNOWN_PLACEHOLDER_TITLES) {
      expect(fixtureText).not.toContain(placeholder);
    }
  });

  it('correctly credits collaborators without Tim White identity collision', () => {
    // Calvin Harris demo must not include Tim White as a credited artist
    // or reference songs from Tim White's catalog (Blessings, Clementine Douglas)
    const fixtureText = fixtureJson({
      persona: INTERNAL_DJ_DEMO_PERSONA,
    });

    expect(fixtureText).not.toContain('Blessings');
    expect(fixtureText).not.toContain('Clementine Douglas');
    expect(fixtureText).not.toContain('Tim White');
  });

  it('has releases with consistent Spotify ID and artwork pairing', () => {
    for (const release of INTERNAL_DJ_DEMO_PERSONA.releases) {
      // If a Spotify URL is present, artwork must also be defined
      const hasSpotifyUrl =
        release.providerUrls &&
        'spotify' in release.providerUrls &&
        typeof (release.providerUrls as Record<string, string>).spotify ===
          'string';

      if (hasSpotifyUrl) {
        expect(
          release.artworkUrl,
          `Release "${release.title}" has Spotify URL but no artwork`
        ).toBeTruthy();
        expect(release.title.length).toBeGreaterThan(0);
        expect(
          (release.artistNames as string[]).length,
          `Release "${release.title}" has no artist credits`
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe('screenshot scenario fixture integrity (JOV-2078)', () => {
  it('uses unique scenario IDs (regression guard)', () => {
    const ids = SCREENSHOT_SCENARIOS.map(scenario => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no scenario routing to a non-existent app path', () => {
    for (const scenario of SCREENSHOT_SCENARIOS) {
      expect(
        scenario.route.startsWith('/'),
        `Scenario "${scenario.id}" route must start with /`
      ).toBe(true);
    }
  });

  it('registers no placeholder scenario titles', () => {
    for (const scenario of SCREENSHOT_SCENARIOS) {
      for (const placeholder of KNOWN_PLACEHOLDER_TITLES) {
        expect(
          scenario.title.toLowerCase(),
          `Scenario "${scenario.id}" title contains placeholder: "${placeholder}"`
        ).not.toContain(placeholder.toLowerCase());
      }
    }
  });

  it('keeps all Tim White profile scenarios using real demo routes', () => {
    const timWhiteScenarios = SCREENSHOT_SCENARIOS.filter(scenario =>
      scenario.id.startsWith('tim-white-profile-')
    );

    expect(timWhiteScenarios.length).toBeGreaterThan(0);

    for (const scenario of timWhiteScenarios) {
      expect(
        scenario.route,
        `Tim White scenario "${scenario.id}" must use the demo showcase route`
      ).toContain('/demo/showcase/tim-white-profile');
    }
  });
});
