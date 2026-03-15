import { describe, expect, it } from 'vitest';
import { computeLinkConfidence } from '@/lib/ingestion/confidence';

describe('computeLinkConfidence', () => {
  it('treats manual user submissions as active with strong confidence', () => {
    const result = computeLinkConfidence({
      sourceType: 'manual',
      signals: [],
      sources: ['dashboard'],
      usernameNormalized: 'artist',
      url: 'https://instagram.com/artist',
    });

    expect(result.state).toBe('active');
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('scores youtube about links as suggested when confidence meets threshold', () => {
    const result = computeLinkConfidence({
      sourceType: 'ingested',
      signals: ['youtube_about_link'],
      sources: ['youtube_about'],
      url: 'https://linktr.ee/example',
    });

    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
    expect(result.state).toBe('suggested');
  });

  it('scores beacons profile links as low confidence by default', () => {
    const result = computeLinkConfidence({
      sourceType: 'ingested',
      signals: ['beacons_profile_link'],
      sources: ['beacons'],
      url: 'https://beacons.ai/example',
    });

    expect(result.state).toBe('rejected');
    expect(result.confidence).toBeGreaterThan(0.1);
    expect(result.confidence).toBeLessThan(0.3);
  });

  it('keeps lightweight ingested linktree hints as low confidence', () => {
    const result = computeLinkConfidence({
      sourceType: 'ingested',
      signals: ['linktree_profile_link'],
      sources: ['linktree'],
      url: 'https://linktr.ee/example',
    });

    expect(result.state).toBe('rejected');
    expect(result.confidence).toBeGreaterThan(0.1);
    expect(result.confidence).toBeLessThan(0.3);
  });

  it('promotes multi-signal ingested links to active when confidence is high', () => {
    const result = computeLinkConfidence({
      sourceType: 'ingested',
      signals: [
        'linktree_profile_link',
        'spotify_presence',
        'handle_similarity',
      ],
      sources: ['linktree', 'spotify'],
      usernameNormalized: 'example',
      url: 'https://linktr.ee/example',
    });

    expect(result.state).toBe('active');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('scores musicfetch_artist_lookup links as active (authoritative enrichment source)', () => {
    // MusicFetch is called with a verified Spotify artist URL and returns
    // authoritative cross-platform data. Links from this source should be
    // immediately active and visible in the drawer — not require manual approval.
    const result = computeLinkConfidence({
      sourceType: 'ingested',
      signals: ['musicfetch_artist_lookup'],
      sources: ['musicfetch'],
      url: 'https://music.apple.com/us/artist/dua-lipa/1065611863',
    });

    expect(result.state).toBe('active');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('scores onboarding_enrichment links as active (direct Spotify-backed enrichment)', () => {
    const result = computeLinkConfidence({
      sourceType: 'ingested',
      signals: ['onboarding_enrichment'],
      sources: ['musicfetch'],
      url: 'https://www.instagram.com/dualipa',
    });

    expect(result.state).toBe('active');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it.each([
    ['instagram_profile_link', 'instagram', 'https://linktr.ee/artist'],
    ['tiktok_profile_link', 'tiktok', 'https://open.spotify.com/artist/abc'],
    ['twitter_profile_link', 'twitter', 'https://linktr.ee/artist'],
  ])('scores %s links as suggested (artist-authored bio links)', (signal, source, url) => {
    const result = computeLinkConfidence({
      sourceType: 'ingested',
      signals: [signal],
      sources: [source],
      url,
    });

    expect(result.state).toBe('suggested');
    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
    expect(result.confidence).toBeLessThan(0.7);
  });

  it('unknown signals produce rejected state (no score boost)', () => {
    const result = computeLinkConfidence({
      sourceType: 'ingested',
      signals: ['unknown_signal_xyz'],
      sources: ['unknown_source'],
      url: 'https://example.com/some-link',
    });

    expect(result.state).toBe('rejected');
    expect(result.confidence).toBe(0);
  });
});
