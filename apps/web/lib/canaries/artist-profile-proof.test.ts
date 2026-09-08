import { describe, expect, it } from 'vitest';
import {
  type ArtistProfileSnapshot,
  compareArtistProfileSnapshots,
  inspectArtistProfile,
} from './artist-profile-proof';

const profileUrl = 'https://jov.ie/tim';
const spotifyUrl = 'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm';
function inspect(body: string, status = 200) {
  const document = new DOMParser().parseFromString(body, 'text/html');
  return inspectArtistProfile({
    document,
    html: body,
    httpStatus: status,
    profileUrl,
    spotifyUrl,
    artistName: 'Tim White',
  });
}
function html(links = '', mentions: unknown[] = []) {
  return `<link rel="canonical" href="${profileUrl}"><script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@id': `${profileUrl}#musicgroup`, sameAs: [spotifyUrl], mentions }] })}</script><section data-testid="profile-aeo-content">${links}</section>`;
}
function snapshot(
  id: string,
  observedAt: string,
  body: string
): ArtistProfileSnapshot {
  return {
    schema: 'jovie-public-artist-integrity/v2',
    id,
    observedAt,
    profileUrl,
    artistName: 'Tim White',
    spotifyUrl,
    releaseSha: null,
    htmlSha256: 'a'.repeat(64),
    ...inspect(body),
  };
}
const before = () =>
  snapshot(
    'before',
    '2026-09-12T20:00:00Z',
    html('<a href="/wrong">Tim White</a>', [
      { '@type': 'MusicGroup', name: 'Tim White', url: 'https://jov.ie/wrong' },
    ])
  );
const after = () => snapshot('after', '2026-09-12T21:00:00Z', html());

describe('public artist integrity evidence', () => {
  it('captures wrong self links in visible About content and machine-readable mentions', () => {
    const result = inspect(
      html(
        '<a href="/wrong">TIM WHITE</a><a href="/tim">Tim White</a><a href="/cosmicgate">Cosmic Gate</a>',
        [
          {
            '@type': 'MusicGroup',
            name: 'Tim White',
            url: 'https://jov.ie/wrong',
          },
        ]
      )
    );
    expect(result.checks.filter(check => check.status === 'fail')).toEqual([
      { id: 'no-ambiguous-self-links', status: 'fail', evidence: ['/wrong'] },
      {
        id: 'no-ambiguous-self-mentions',
        status: 'fail',
        evidence: ['https://jov.ie/wrong'],
      },
    ]);
    expect(result.links).toContain('https://jov.ie/cosmicgate');
  });
  it('never treats missing content or malformed structured data as clean evidence', () => {
    const result = inspect(
      '<script type="application/ld+json">broken</script>'
    );
    expect(
      result.checks.find(c => c.id === 'no-ambiguous-self-links')?.status
    ).toBe('unknown');
    expect(
      result.checks.find(c => c.id === 'no-ambiguous-self-mentions')?.status
    ).toBe('unknown');
    expect(result.checks.find(c => c.id === 'canonical-profile')?.status).toBe(
      'fail'
    );
    expect(inspect(html(), 503).checks[1]?.status).toBe('unknown');
    expect(inspect(`${html()}Internal server error`).checks[0]?.status).toBe(
      'fail'
    );
  });
  it('ignores non-HTTP links and records malformed URLs without aborting valid inventory', () => {
    expect(
      inspect(
        html(
          '<a href="mailto:hello@example.com">email</a><a href="http://[">broken</a><a href="/tim">home</a>'
        )
      ).links
    ).toEqual([profileUrl, spotifyUrl]);
  });
  it('handles singleton mentions and refuses malformed machine evidence', () => {
    const bad = {
      '@type': 'MusicGroup',
      name: 'Tim White',
      url: 'https://jov.ie/wrong',
    };
    const singleton = html('', [bad]).replace(
      JSON.stringify([bad]),
      JSON.stringify(bad)
    );
    expect(inspect(singleton).checks[5]?.status).toBe('fail');
    const malformed = html('', [bad]).replace(
      JSON.stringify([bad]),
      '"broken"'
    );
    expect(inspect(malformed).checks[5]?.status).toBe('unknown');
  });
  it('preserves an evidenced self-titled release while rejecting malformed self links', () => {
    const release = {
      '@type': 'MusicRecording',
      name: 'Tim White',
      url: `${profileUrl}/self-titled`,
    };
    expect(
      inspect(html('<a href="/tim/self-titled">Tim White</a>', [release]))
        .checks.slice(4)
        .map(c => c.status)
    ).toEqual(['pass', 'pass']);
    expect(
      inspect(html('<a href="http://[">Tim White</a>')).checks[4]
    ).toMatchObject({ status: 'fail', evidence: ['http://['] });
    expect(inspect(html(), 307).checks[0]?.status).toBe('fail');
  });
  it('requires the exact canonical Spotify anchor, not another same-name artist', () => {
    expect(
      inspect(
        html().replace(spotifyUrl, 'https://open.spotify.com/artist/wrong')
      ).checks.find(c => c.id === 'spotify-identity')?.status
    ).toBe('fail');
  });
  it('reports observed fixed checks and reversals without claiming causality', () => {
    expect(compareArtistProfileSnapshots(before(), after())).toMatchObject({
      comparable: true,
      fixed: ['no-ambiguous-self-links', 'no-ambiguous-self-mentions'],
      regressed: [],
      delta: 2,
    });
    const regression = {
      ...before(),
      id: 'later',
      observedAt: '2026-09-12T22:00:00Z',
    };
    expect(compareArtistProfileSnapshots(after(), regression)).toMatchObject({
      comparable: true,
      fixed: [],
      regressed: ['no-ambiguous-self-links', 'no-ambiguous-self-mentions'],
      delta: -2,
    });
  });
  it.each([
    { profileUrl: 'https://jov.ie/other' },
    { artistName: 'Other' },
    { spotifyUrl: 'https://spotify.com/other' },
    { id: 'before' },
    { observedAt: '2026-09-12T19:00:00Z' },
    { checks: after().checks.slice(1) },
    { checks: [...after().checks, after().checks[0]!] },
  ])('rejects mismatched or stale comparisons: %j', patch => {
    expect(
      compareArtistProfileSnapshots(before(), { ...after(), ...patch })
    ).toMatchObject({ comparable: false, delta: null, fixed: [] });
  });
  it('keeps unknown measurements out of improvement counts and aggregate deltas', () => {
    const current = after();
    current.checks[4]!.status = 'unknown';
    expect(compareArtistProfileSnapshots(before(), current)).toMatchObject({
      comparable: true,
      fixed: ['no-ambiguous-self-mentions'],
      delta: null,
    });
  });
  it('rejects fabricated snapshot shapes before comparison', () => {
    expect(() => compareArtistProfileSnapshots({}, after())).toThrow();
    expect(() =>
      compareArtistProfileSnapshots(before(), {
        ...after(),
        observedAt: 'yesterday',
      })
    ).toThrow();
  });
});
