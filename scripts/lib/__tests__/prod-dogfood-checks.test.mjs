import { describe, expect, it } from 'vitest';
import { fingerprintFor } from '../prod-dogfood.mjs';
import {
  checkBuildBinding,
  checkDestinations,
  checkPublishedLinks,
  checkReleasePages,
  checkShareImages,
  checkSitemap,
  decodeEntities,
  extractLinksFromText,
  extractReleaseUrls,
  extractShortDescription,
  extractVideoIds,
  isComingSoon,
  titleMatchesSlug,
} from '../prod-dogfood-checks.mjs';

const BASE = 'https://jov.ie';
const SHA = 'a'.repeat(40);
const page = (title, extra = '') =>
  `<html><head><title>${title}</title><link rel="canonical" href="${BASE}/tim/x"/>${extra}</head><body>ok</body></html>`;
const probeFrom = table => async url => {
  const hit = table[url];
  if (!hit) return { status: 404, finalUrl: url, text: '' };
  return { finalUrl: url, text: '', ...hit };
};

describe('fingerprints and slugs', () => {
  it('is stable, lowercase and valid as a remediation key', () => {
    const fp = fingerprintFor({
      mission: 'dogfood:published-links',
      check: 'inbound-link-resolves',
      target: 'https://jov.ie/tim/take-me-over',
    });
    expect(fp).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(fp.length).toBeLessThanOrEqual(80);
    expect(fp).toBe(
      fingerprintFor({
        mission: 'dogfood:published-links',
        check: 'inbound-link-resolves',
        target: 'https://jov.ie/tim/take-me-over',
      })
    );
  });

  it('matches a title against the words the slug promises, ignoring -N', () => {
    expect(
      titleMatchesSlug(
        'Take Me Over by Tim White - Stream Now | Jovie',
        'take-me-over-2'
      )
    ).toBe(true);
    expect(
      titleMatchesSlug(
        "Love Don't Let Me Down by Tim White | Jovie",
        'love-dont-let-me-down'
      )
    ).toBe(true);
    expect(
      titleMatchesSlug('Wheels Up by Lynx and Tim White', 'seaside-heights-3')
    ).toBe(false);
  });

  it('detects the Coming soon placeholder shell', () => {
    expect(isComingSoon(page('Coming soon · Tim White | Jovie'))).toBe(true);
    expect(isComingSoon(page('Wheels Up by Tim White'))).toBe(false);
  });
});

describe('extraction', () => {
  it('lists release URLs from JSON-LD but not nested paths', () => {
    const ld = JSON.stringify({
      '@type': 'MusicGroup',
      track: [
        { url: `${BASE}/tim/wheels-up` },
        { url: `${BASE}/tim/wheels-up/track-2` },
        { url: `${BASE}/other/x` },
      ],
    });
    const html = `<script type="application/ld+json">${ld}</script>`;
    expect(extractReleaseUrls(html, { base: BASE, handle: 'tim' })).toEqual([
      `${BASE}/tim/wheels-up`,
    ]);
  });

  it('pulls jov.ie links out of a YouTube watch page description', () => {
    const html =
      'x "shortDescription":"Listen: https://jov.ie/tim/take-me-over.\\nFollow https://x.com/itstimwhite","y"';
    const links = extractLinksFromText(extractShortDescription(html), {
      source: 'YouTube abc',
    });
    expect(links).toEqual([
      { url: 'https://jov.ie/tim/take-me-over', source: 'YouTube abc' },
    ]);
  });

  it('lists distinct video ids from a channel videos page', () => {
    const html =
      '{"videoId":"uz3IZdedIJE"},{"videoId":"dZwdRmqVwrI"},{"videoId":"uz3IZdedIJE"}';
    expect(extractVideoIds(html)).toEqual(['uz3IZdedIJE', 'dZwdRmqVwrI']);
  });

  it('decodes numeric and hex entities so apostrophes in titles still match slugs', () => {
    expect(decodeEntities('Love Don&#x27;t Let Me Down &amp; &#39;x')).toBe(
      "Love Don't Let Me Down & 'x"
    );
  });
});

describe('checks', () => {
  it('fails an inbound link that 404s (the release-link defect Tim found by hand)', async () => {
    const checks = await checkPublishedLinks({
      probe: probeFrom({}),
      base: BASE,
      links: [{ url: `${BASE}/tim/take-me-over`, source: 'yt' }],
    });
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({
      id: 'inbound-link-resolves',
      status: 'failed',
      severity: 'P1',
      source: 'yt',
    });
  });

  it('fails an inbound link that lands on the Coming soon placeholder', async () => {
    const url = `${BASE}/tim/seaside-heights`;
    const [c] = await checkPublishedLinks({
      probe: probeFrom({
        [url]: { status: 200, text: page('Coming soon · Tim White | Jovie') },
      }),
      base: BASE,
      links: [{ url, source: 'yt' }],
    });
    expect(c.status).toBe('failed');
    expect(c.summary).toMatch(/Coming soon/);
  });

  it('passes an inbound link that redirects to the right release', async () => {
    const url = `${BASE}/tim/take-me-over`;
    const dest = `${BASE}/tim/take-me-over-2`;
    const [c] = await checkPublishedLinks({
      probe: probeFrom({
        [url]: {
          status: 200,
          finalUrl: dest,
          text: page('Take Me Over by Tim White | Jovie'),
        },
      }),
      base: BASE,
      links: [{ url, source: 'yt' }],
    });
    expect(c.status).toBe('passed');
  });

  it('requires a destination on every release page', async () => {
    const url = `${BASE}/tim/x`;
    const withDsp = page(
      'X by Tim White',
      '<a href="https://open.spotify.com/album/1">s</a>'
    );
    const checks = await checkReleasePages({
      probe: probeFrom({ [url]: { status: 200, text: withDsp } }),
      base: BASE,
      releaseUrls: [url],
    });
    expect(checks.map(c => [c.id, c.status])).toEqual([
      ['release-page-resolves', 'passed'],
      ['release-has-destinations', 'passed'],
    ]);
    const none = await checkReleasePages({
      probe: probeFrom({
        [url]: { status: 200, text: page('X by Tim White') },
      }),
      base: BASE,
      releaseUrls: [url],
    });
    expect(none[1]).toMatchObject({
      id: 'release-has-destinations',
      status: 'failed',
    });
  });

  it('treats bot walls as unverified, not failures, and dead links as failures', async () => {
    const probe = probeFrom({
      'https://a.example/': { status: 403 },
      'https://b.example/': { status: 404 },
      'https://c.example/': { status: 200 },
    });
    const checks = await checkDestinations({
      probe,
      urls: ['https://a.example/', 'https://b.example/', 'https://c.example/'],
    });
    expect(checks.map(c => c.status)).toEqual([
      'unverified',
      'failed',
      'passed',
    ]);
  });

  it('binds only to a full 40-hex commit and a deployment id', async () => {
    const ok = await checkBuildBinding({
      probe: probeFrom({
        [`${BASE}/api/health/build-info`]: {
          status: 200,
          text: JSON.stringify({ commitSha: SHA, deploymentId: 'dpl_1' }),
        },
      }),
      base: BASE,
    });
    expect(ok.binding).toMatchObject({ commitSha: SHA, deploymentId: 'dpl_1' });
    const bad = await checkBuildBinding({
      probe: probeFrom({
        [`${BASE}/api/health/build-info`]: {
          status: 200,
          text: JSON.stringify({ commitSha: 'abc' }),
        },
      }),
      base: BASE,
    });
    expect(bad.binding).toBeNull();
    expect(bad.check.status).toBe('failed');
  });
});

describe('sitemap and share images', () => {
  const sm = urls =>
    `<urlset>${urls.map(u => `<url><loc>${u}</loc></url>`).join('')}</urlset>`;
  it('flags a sitemap URL that 404s or lands on a noindex placeholder', async () => {
    const probe = probeFrom({
      [`${BASE}/sitemap.xml`]: {
        status: 200,
        text: sm([`${BASE}/a`, `${BASE}/b`, `${BASE}/c`]),
      },
      [`${BASE}/a`]: {
        status: 200,
        text: `<title>A</title><link rel="canonical" href="${BASE}/a"/>`,
      },
      [`${BASE}/c`]: {
        status: 200,
        text: '<title>Coming soon · X</title><meta name="robots" content="noindex"/>',
      },
    });
    const checks = await checkSitemap({ probe, base: BASE });
    expect(checks.map(c => c.status)).toEqual(['passed', 'failed', 'failed']);
    expect(checks[1]).toMatchObject({ severity: 'P1', url: `${BASE}/b` });
  });

  it('requires og:image to resolve to an image', async () => {
    const probe = probeFrom({
      [`${BASE}/ok`]: {
        status: 200,
        text: '<meta property="og:image" content="/img.png"/>',
      },
      [`${BASE}/img.png`]: { status: 200, contentType: 'image/png' },
      [`${BASE}/none`]: { status: 200, text: '<title>x</title>' },
    });
    const checks = await checkShareImages({
      probe,
      urls: [`${BASE}/ok`, `${BASE}/none`],
    });
    expect(checks.map(c => c.status)).toEqual(['passed', 'failed']);
  });
});
