import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard: no e2e spec may hardcode a shared real Spotify artist id without a
 * self-cleaning mechanism. A hardcoded id that persists across runs leaves a
 * stale creator_profiles binding and turns the next run's claim step into
 * ownership_conflict:v1 (Golden Path outage 2026-10-29; JOV-9928).
 *
 * A spec that names a Spotify artist id must either select it from the shared
 * pool (selectUnclaimedCertArtist), release it via the self-releasing seeding
 * helpers (ensureDbUser / seedOnboardedCreatorProfile), or have teardown.
 */
const E2E_DIR = join(__dirname, '../../e2e');
const SPOTIFY_ID_LITERAL = /['"/]([0-9A-Za-z]{22})['"\s)`]/g;
const SPOTIFY_CONTEXT = /spotify/i;

const SELF_CLEANING = [
  'selectUnclaimedCertArtist',
  'ensureDbUser',
  'seedOnboardedCreatorProfile',
  'afterAll',
  'afterEach',
];

// Specs that only type the id into a mocked UI and never write a binding.
const MOCK_ONLY_ALLOWLIST = new Set([
  'storybook-onboarding-recovery.spec.ts',
  'onboarding-david-guetta-demo.spec.ts',
]);

function hardcodedSpotifyIds(source: string): string[] {
  const ids: string[] = [];
  for (const line of source.split('\n')) {
    if (!SPOTIFY_CONTEXT.test(line)) continue;
    for (const m of line.matchAll(SPOTIFY_ID_LITERAL)) {
      // Real ids mix digits and letters; skips plain words.
      if (/\d/.test(m[1]) && /[a-z]/.test(m[1]) && /[A-Z]/.test(m[1])) {
        ids.push(m[1]);
      }
    }
  }
  return ids;
}

describe('e2e shared identity fixture guard', () => {
  const specs = readdirSync(E2E_DIR).filter(f => f.endsWith('.spec.ts'));

  it('finds the e2e specs', () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  it.each(specs)('%s has no un-cleaned hardcoded shared artist', file => {
    const source = readFileSync(join(E2E_DIR, file), 'utf8');
    const ids = hardcodedSpotifyIds(source);
    if (ids.length === 0 || MOCK_ONLY_ALLOWLIST.has(file)) return;
    const cleaned = SELF_CLEANING.some(token => source.includes(token));
    expect(
      cleaned,
      `${file} hardcodes Spotify id(s) ${[...new Set(ids)].join(', ')} without teardown. Select from SHARED_E2E_ARTIST_POOL via selectUnclaimedCertArtist and release the binding in afterAll.`
    ).toBe(true);
  });

  it('detects a hardcoded id with no cleanup', () => {
    const bad = `const a = { id: '1ZlSI1juLMMN1HU8X7RViN' }; // spotify`;
    expect(hardcodedSpotifyIds(bad)).toEqual(['1ZlSI1juLMMN1HU8X7RViN']);
  });
});
