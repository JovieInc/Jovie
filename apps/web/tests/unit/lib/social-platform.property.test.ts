/**
 * Property-based tests for the social-platform helpers.
 *
 * Backstop for JOV-2149 gotcha class #1 (duplicate items) and class #2
 * (empty/placeholder values rendered as real). Each property targets an
 * invariant that, if it held in production, would prevent the original
 * "YouTube YouTube YouTube" bug.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dedupeLinks, extractHandleFromUrl } from '@/lib/utils/social-platform';

const platformArb = fc.constantFrom(
  'youtube',
  'instagram',
  'tiktok',
  'x',
  'facebook',
  'threads',
  'snapchat',
  'twitch',
  'linktree',
  'unknown'
);

const pathArb = fc.stringMatching(/^\/[a-zA-Z0-9_@\-./]{0,40}$/);

const linkArb = fc.record({
  id: fc.uuid(),
  platform: platformArb,
  url: fc
    .tuple(
      fc.constantFrom('https://', 'http://'),
      fc.constantFrom('', 'www.'),
      fc.constantFrom(
        'youtube.com',
        'instagram.com',
        'tiktok.com',
        'x.com',
        'twitter.com',
        'facebook.com'
      ),
      pathArb
    )
    .map(([proto, www, host, path]) => `${proto}${www}${host}${path}`),
});

describe('dedupeLinks (property)', () => {
  it('idempotent: dedupe(dedupe(xs)) === dedupe(xs)', () => {
    fc.assert(
      fc.property(fc.array(linkArb, { maxLength: 30 }), links => {
        const once = dedupeLinks(links);
        const twice = dedupeLinks(once);
        expect(twice).toEqual(once);
      })
    );
  });

  it('never invents links — every output element appears in input', () => {
    fc.assert(
      fc.property(fc.array(linkArb, { maxLength: 30 }), links => {
        const out = dedupeLinks(links);
        for (const link of out) {
          expect(links).toContainEqual(link);
        }
      })
    );
  });

  it('order-stable: relative order of kept links matches input order', () => {
    fc.assert(
      fc.property(fc.array(linkArb, { maxLength: 30 }), links => {
        const out = dedupeLinks(links);
        const indices = out.map(o => links.indexOf(o));
        for (let i = 1; i < indices.length; i++) {
          expect(indices[i]).toBeGreaterThan(indices[i - 1]!);
        }
      })
    );
  });

  it('output is shorter than or equal to input, never longer', () => {
    fc.assert(
      fc.property(fc.array(linkArb, { minLength: 1, maxLength: 30 }), links => {
        expect(dedupeLinks(links).length).toBeLessThanOrEqual(links.length);
      })
    );
  });

  it('duplicating a single link N times collapses to exactly one row', () => {
    fc.assert(
      fc.property(linkArb, fc.integer({ min: 2, max: 6 }), (link, n) => {
        const dupes = Array.from({ length: n }, () => ({ ...link }));
        expect(dedupeLinks(dupes)).toHaveLength(1);
      })
    );
  });

  it('trailing slash + casing variants of same URL collapse to one row', () => {
    fc.assert(
      fc.property(
        linkArb.filter(l => !l.url.endsWith('/')),
        link => {
          const variants = [
            { ...link, url: link.url },
            { ...link, url: `${link.url}/` },
            { ...link, url: link.url.toUpperCase() },
          ];
          expect(dedupeLinks(variants)).toHaveLength(1);
        }
      )
    );
  });

  it('preserves distinct query strings — ?id=1 and ?id=2 stay separate', () => {
    // Regression for CodeRabbit JOV-2149: the prior dedupe key dropped
    // u.search, so Facebook profile URLs like profile.php?id=1 and ?id=2
    // collapsed to one row even though they are different destinations.
    const links = [
      {
        id: 'a',
        platform: 'facebook',
        url: 'https://facebook.com/profile.php?id=1',
      },
      {
        id: 'b',
        platform: 'facebook',
        url: 'https://facebook.com/profile.php?id=2',
      },
    ];
    expect(dedupeLinks(links)).toHaveLength(2);
  });

  it('collapses query-string casing variants of the same destination', () => {
    // The query string is lowercased in the dedupe key, so ?ID=1 and
    // ?id=1 are the same destination.
    const links = [
      {
        id: 'a',
        platform: 'facebook',
        url: 'https://facebook.com/profile.php?ID=1',
      },
      {
        id: 'b',
        platform: 'facebook',
        url: 'https://facebook.com/profile.php?id=1',
      },
    ];
    expect(dedupeLinks(links)).toHaveLength(1);
  });
});

describe('extractHandleFromUrl (property)', () => {
  it('never throws on arbitrary string input', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), raw => {
        expect(() => extractHandleFromUrl(raw)).not.toThrow();
      })
    );
  });

  it('return value is either a non-empty string or null — never empty', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), raw => {
        const out = extractHandleFromUrl(raw);
        if (out === null) return;
        expect(typeof out).toBe('string');
        expect(out.length).toBeGreaterThan(0);
      })
    );
  });

  it('never returns a bare platform display name (would render as a fake handle)', () => {
    // The original bug: extractHandleFromUrl returned null and the UI
    // fell back to "YouTube" / "Instagram" — a user-looking label that
    // masqueraded as a handle. Defense-in-depth: the helper itself must
    // never return one of those bare display names.
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), raw => {
        const out = extractHandleFromUrl(raw);
        if (out === null) return;
        expect([
          'YouTube',
          'Instagram',
          'TikTok',
          'Facebook',
          'X',
        ]).not.toContain(out);
      })
    );
  });
});
