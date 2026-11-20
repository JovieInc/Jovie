import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import {
  certifyArtistProfile,
  exposedDeferredSurfaces,
  isDeclaredRedirect,
} from './certify-artist-profile';

const directories: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  const paths = directories.splice(0);
  await Promise.all(paths.map(p => rm(p, { recursive: true, force: true })));
});
async function output() {
  const path = await mkdtemp(join(tmpdir(), 'artist-proof-test-'));
  directories.push(path);
  return path;
}
const profileUrl = TIM_WHITE_PROFILE.publicProfileUrl;
const releaseUrl = `${profileUrl}/never-say-a-word`;
const malformedReturn = '<a href="http://[">Back to Tim White</a>';
const wrongReturn = '<a href="/someone-else">Back to Tim White</a>';
const releaseHtml =
  '<a href="/tim" aria-label="Back to Tim White">Back to Tim White</a>';
const profileHtml = (links = '', mentions: unknown[] = []) =>
  `<link rel="canonical" href="${profileUrl}"><script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@id': `${profileUrl}#musicgroup`, name: TIM_WHITE_PROFILE.name, sameAs: [TIM_WHITE_PROFILE.spotifyUrl], mentions }] })}</script><section data-testid="profile-aeo-content">${links}</section>`;
const html = profileHtml(
  '<a href="/tim">Tim White</a><a href="/broken">other</a><a href="https://example.com/">external</a>'
);
const redirect = (location: string, status = 307) =>
  new Response(null, { status, headers: { location } });
async function collect(
  fetcher: typeof fetch,
  dir?: string,
  args: string[] = []
) {
  const result = await certifyArtistProfile(
    ['--output', dir ?? (await output()), ...args],
    fetcher
  );
  return {
    ...result,
    report: JSON.parse(await readFile(result.reportPath, 'utf8')),
  };
}
function linkFixture(
  path: string,
  probe: (attempt: number, init?: RequestInit) => Response | Promise<Response>,
  target = path
) {
  let attempts = 0;
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const href = String(url);
    if (href === new URL(target, profileUrl).href)
      return probe(++attempts, init);
    if (path !== target && href === new URL(path, profileUrl).href)
      return redirect(target);
    if (href.endsWith('/api/health/build-info'))
      return Response.json({ commitSha: 'a'.repeat(40) });
    if (href !== profileUrl) throw new Error(`Unexpected fetch: ${href}`);
    return new Response(profileHtml(`<a href="${path}">Target</a>`));
  });
  return { fetcher, calls: () => attempts };
}
async function collectRetry(fixture: ReturnType<typeof linkFixture>) {
  const directory = await output();
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  const pending = collect(fixture.fetcher, directory);
  await vi.waitFor(() => expect(fixture.calls()).toBe(1));
  await vi.advanceTimersByTimeAsync(1_000);
  return pending;
}
describe('artist proof collector', () => {
  it('certifies guide/API/MCP and exact raw-HTML items with stable build evidence', async () => {
    const release = {
      id: 'release-1',
      title: 'Song',
      url: `${profileUrl}/song`,
      releaseDate: '2026-01-02',
    };
    const product = {
      id: '00000000-0000-4000-8000-000000000002',
      title: 'Tee',
      url: `${profileUrl}/merch/00000000-0000-4000-8000-000000000002`,
    };
    const artist = {
      username: 'tim',
      name: 'Tim White',
      profileUrl,
      isClaimed: false,
      isVerified: false,
      links: [{ url: 'https://example.com/work' }],
    };
    const serviceUrl = 'https://music.apple.com/album/song';
    const serviceLabel = 'Listen on Apple Music';
    const releaseNode = {
      '@type': 'MusicAlbum',
      name: 'Song',
      url: release.url,
      datePublished: release.releaseDate,
      sameAs: [serviceUrl],
      potentialAction: [
        {
          '@type': 'ListenAction',
          name: serviceLabel,
          target: { urlTemplate: serviceUrl },
        },
      ],
    };
    const guide = `# Tim White\n- **Canonical URL**: ${profileUrl}\n- **Claim status**: Unclaimed\n- **Jovie verification**: Not verified\n- [Work](<https://example.com/work>)\n## Latest Release\n- **Title**: Song\n- **Released**: 2026-01-02\n- **Link**: ${release.url}\n`;
    const api = { artist, releases: [release], merch: [product] };
    for (const scenario of [
      'valid',
      'collection',
      'mcp-mismatch',
      'wrong-item',
      'missing-service',
      'build-drift',
      'off-origin',
      'unavailable',
    ]) {
      const directory = await output();
      let observedRelease = release;
      if (scenario === 'collection')
        observedRelease = { ...release, url: `${profileUrl}/releases` };
      if (scenario === 'off-origin')
        observedRelease = { ...release, url: 'https://outside.example/song' };
      const observedApi = { ...api, releases: [observedRelease] };
      let buildReads = 0;
      const fetcher = vi.fn<typeof fetch>(async (url, init) => {
        const href = String(url);
        if (href === profileUrl) return new Response(profileHtml());
        if (href.endsWith('/api/health/build-info')) {
          buildReads++;
          return Response.json({
            commitSha: (scenario === 'build-drift' && buildReads > 2
              ? 'b'
              : 'a'
            ).repeat(40),
          });
        }
        if (href.endsWith('/api/v1/tim')) return Response.json(observedApi);
        if (href.endsWith('/llms.txt')) return new Response(guide);
        if (href.endsWith('/api/mcp/tim')) {
          if (scenario === 'unavailable')
            return new Response('', { status: 503 });
          const request = JSON.parse(String(init?.body));
          const resource = request.params.uri.split('/').at(-1);
          let content =
            resource === 'bio'
              ? artist
              : observedApi[resource as 'releases' | 'merch'];
          if (scenario === 'mcp-mismatch' && resource === 'releases')
            content = [];
          return Response.json({
            result: { contents: [{ text: JSON.stringify(content) }] },
          });
        }
        if (href === release.url) {
          const node =
            scenario === 'wrong-item'
              ? { ...releaseNode, name: 'Wrong item' }
              : scenario === 'missing-service'
                ? { ...releaseNode, potentialAction: [] }
                : releaseNode;
          return new Response(
            `<link rel="canonical" href="${release.url}"><script type="application/ld+json">${JSON.stringify(node)}</script>`
          );
        }
        if (href === product.url)
          return new Response(
            `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Tee', url: product.url, sku: product.id })}</script>`
          );
        throw new Error(`Unexpected URL: ${href}`);
      });
      const result = await collect(fetcher, directory, ['--agent-surfaces']);
      expect(result.discovery?.failed, scenario).toBe(scenario !== 'valid');
      expect(result.failed, scenario).toBe(scenario !== 'valid');
      expect(
        fetcher.mock.calls.every(
          ([url]) => new URL(String(url)).origin === 'https://jov.ie'
        )
      ).toBe(true);
      const { report } = result;
      expect(report.discovery.evidence.length).toBeGreaterThan(0);
      for (const receipt of report.discovery.evidence) {
        expect(receipt.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(
          await readFile(join(directory, receipt.file), 'utf8')
        ).toBeTypeOf('string');
      }
      if (scenario === 'valid') {
        expect(report.discovery).toMatchObject({
          releaseSha: 'a'.repeat(40),
          stableBuild: true,
          mcpMatches: true,
        });
        expect(report.discovery.items[0].destinations).toEqual([
          { label: serviceLabel, url: serviceUrl },
        ]);
      }
    }
  });
  it('treats the live pay control as the deferred tips surface', () => {
    const deferred = exposedDeferredSurfaces;
    for (const marker of [
      'pay-trigger',
      'profile-mode-drawer-pay',
      'profile-pay-recipient',
      'tip-button',
      'tip-drawer',
    ]) {
      expect(deferred(`<button data-testid="${marker}"></button>`)).toEqual([
        'tips',
      ]);
    }
    expect(deferred('<i data-testid="listen-trigger"></i>')).toEqual([]);
  });
  it('persists raw evidence and failure receipts, probes only same-origin links and never follows redirects', async () => {
    const directory = await output();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(html, { status: 200 }))
      .mockResolvedValue(new Response(null, { status: 404 }));
    const result = await collect(fetcher, directory);
    expect(result.failed).toBe(true);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      profileUrl, // No Sentry baggage: bind the release via build-info.
      'https://jov.ie/api/health/build-info',
      'https://jov.ie/broken',
      'https://jov.ie/tim',
    ]);
    expect(
      fetcher.mock.calls.every(([, init]) => init?.redirect === 'manual')
    ).toBe(true);
    const { report } = result;
    expect(report).toMatchObject({
      publicationApproved: false,
      accountOwnership: 'unverified',
      searchVisibilityScore: null,
      action: null,
      attribution: 'unverified',
    });
    expect(await readdir(directory)).toHaveLength(3);
    expect(
      await readFile(join(directory, `${report.snapshot.id}.html`), 'utf8')
    ).toBe(html);
  });
  it('records redirect provenance as failure, never a successful profile', async () => {
    const directory = await output();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(redirect('https://example.com/', 302));
    const result = await collect(fetcher, directory);
    expect(result.failed).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const { report } = result;
    expect(report.response).toMatchObject({
      status: 302,
      location: 'https://example.com/',
    });
    expect(report.snapshot.checks[0].status).toBe('fail');
    const redirectedProbe = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(html, { status: 200 }))
      .mockResolvedValue(new Response(null, { status: 307 }));
    const incomplete = await collect(redirectedProbe, directory);
    expect(incomplete.failed).toBe(true);
  });
  it('records unknown probes, compares immutable snapshots and validates required arguments', async () => {
    const directory = await output();
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.cache === 'no-store')
        return new Response(html, { status: 200 });
      throw new Error('timeout');
    });
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const run = async (args: string[] = []) => {
      const pending = collect(fetcher, directory, args);
      await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
      await vi.advanceTimersByTimeAsync(1_000);
      return pending;
    };
    const baseline = await run();
    const result = await run(['--baseline', baseline.snapshotPath]);
    expect(result.failed).toBe(true);
    const comparison = result.comparison;
    expect(comparison).toMatchObject({ comparable: true, fixed: [], delta: 0 });
    const { report } = result;
    expect(
      report.linkChecks.every(
        (check: { status: unknown }) => check.status === null
      )
    ).toBe(true);
    expect(await readdir(directory)).toHaveLength(6);
    await expect(certifyArtistProfile([], fetcher)).rejects.toThrow('--output');
    await expect(
      certifyArtistProfile(['--output', '--baseline'], fetcher)
    ).rejects.toThrow('requires a value');
  });
  it('follows only declared redirects, one same-origin hop, and requires a 200', async () => {
    const artist = '/artists/f5441adb-6789-449a-9553-ab7460c9c61c';
    const outside = '/artists/3836027a-8351-4c0b-8922-c3259387bbf8';
    const claim = '/start?campaign=proof-to-claim';
    const destinations = [
      [artist, '/a_eiqd46x3irj64dlgo8a3glau4', 200],
      ['/tim/listen', '/tim?mode=listen', 404],
      [claim, '/waitlist', 200],
      ['/moved', '/tim', null],
      [outside, 'https://example.com/x', null],
    ] as const;
    const routes = new Map<string, () => Response>();
    routes.set(
      profileUrl,
      () =>
        new Response(
          profileHtml(
            destinations.map(([path]) => `<a href="${path}">Link</a>`).join('')
          )
        )
    );
    const sha = '0f42058e6e24a9882a538a6b5d94fa84b2f7c15f';
    routes.set('https://jov.ie/api/health/build-info', () =>
      Response.json({ commitSha: sha })
    );
    for (const [path, target, status] of destinations) {
      routes.set(new URL(path, profileUrl).href, () => redirect(target));
      if (status !== null)
        routes.set(
          new URL(target, profileUrl).href,
          () => new Response('', { status })
        );
    }
    const fetcher = vi.fn<typeof fetch>(async url => {
      const route = routes.get(String(url));
      if (!route) throw new Error(`unexpected fetch ${String(url)}`);
      return route();
    });
    const result = await collect(fetcher);
    const links: { url: string }[] = result.report.linkChecks;
    const byUrl = Object.fromEntries(links.map(check => [check.url, check]));
    for (const [path, target, status] of destinations) {
      const check = byUrl[new URL(path, profileUrl).href];
      if (path === '/moved') {
        expect(check).toEqual(
          expect.not.objectContaining({ finalStatus: expect.anything() })
        );
      } else {
        expect(check).toMatchObject({
          status: 307,
          redirectedTo: new URL(target, profileUrl).href,
          finalStatus: status,
        });
      }
    }
    expect(fetcher).not.toHaveBeenCalledWith(
      'https://example.com/x',
      expect.anything()
    );
    expect(result.report.snapshot.releaseSha).toBe(sha);
    expect(result.failed).toBe(true);
  });
  it.each([
    ['/artists/f5441adb-6789-449a-9553-ab7460c9c61c', undefined, true],
    ['/tim/listen', undefined, true],
    ['/someone-else/listen', undefined, false],
    ['/artists/not-a-uuid', undefined, false],
    ['/moved', undefined, false],
    ['/start', '/waitlist', true],
    ['/start?campaign=proof-to-claim', 'https://jov.ie/waitlist', true],
    ['/signup', '/waitlist', true],
    ['/start', '/signin', false],
    ['/start', undefined, false],
    ['/claim', '/waitlist', false],
  ])('declares redirect %s to %s: %s', (path, location, allowed) => {
    expect(isDeclaredRedirect(new URL(path, profileUrl), 'tim', location)).toBe(
      allowed
    );
  });
  it('requires the reference release to return explicitly to Tim White', async () => {
    const fixture = linkFixture(
      '/tim/never-say-a-word',
      () => new Response(releaseHtml)
    );
    const passed = await collect(fixture.fetcher);
    expect(passed.failed).toBe(false);
    expect(passed.exposedDeferredSurfaces).toEqual([]);
    expect(passed.report.linkChecks).toContainEqual(
      expect.objectContaining({ url: releaseUrl, canonicalArtistReturn: true })
    );
    fixture.fetcher.mockImplementation(
      async url =>
        new Response(
          String(url) === profileUrl
            ? `${profileHtml()}<button data-ask-jovie-launcher></button><a href="${releaseUrl}">Release</a>`
            : `${releaseHtml}<div data-testid="operator-banner"></div>`
        )
    );
    const exposed = await collect(fixture.fetcher);
    expect(exposed.failed).toBe(false);
    const surfaces = exposed.exposedDeferredSurfaces;
    expect(surfaces).toEqual(['broad_ai', 'operator_controls']);
  });
  it.each([false, true])(
    'renews aborted signals (followed hop: %s)',
    async followed => {
      const controllers = new Map<AbortSignal, AbortController>();
      vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
        const controller = new AbortController();
        controllers.set(controller.signal, controller);
        return controller.signal;
      });
      const signals: (AbortSignal | null | undefined)[] = [];
      const target = '/tim/never-say-a-word';
      const fixture = linkFixture(
        followed ? '/tim/listen' : target,
        (attempt, init) => {
          signals.push(init?.signal);
          if (attempt === 1) {
            controllers.get(init?.signal as AbortSignal)?.abort();
            throw new Error('connection timeout');
          }
          init?.signal?.throwIfAborted();
          return new Response(releaseHtml);
        },
        target
      );
      const result = await collectRetry(fixture);
      expect(result.failed).toBe(false);
      expect(fixture.calls()).toBe(2);
      expect(signals[0]?.aborted).toBe(true);
      expect(signals[1]).not.toBe(signals[0]);
      expect(signals[1]?.aborted).toBe(false);
      expect(result.report.linkChecks).toMatchObject([
        { status: followed ? 307 : 200 },
      ]);
      if (followed) expect(result.report.linkChecks[0].finalStatus).toBe(200);
    }
  );
  // name, HTTP status, body, thrown attempts, followed hop, body unavailable
  it.each<[string, number, string, number, boolean, boolean]>([
    ['HTTP 404', 404, '', 0, false, false],
    ['HTTP 410', 410, '', 0, false, false],
    ['HTTP 404 after throw', 404, '', 1, false, false],
    ['HTTP 500', 500, '', 0, false, false],
    ['undeclared redirect', 307, '', 0, false, false],
    ['empty release', 200, '', 0, false, false],
    ['missing return', 200, '<a href="/">Jovie</a>', 0, false, false],
    ['malformed return', 200, malformedReturn, 0, false, false],
    ['direct exhaustion', 200, '', 2, false, false],
    ['followed exhaustion', 200, '', 2, true, false],
    ['mismatch after throw', 200, wrongReturn, 1, false, false],
    ['unreadable HTTP 200', 200, '', 0, false, true],
  ])(
    '%s preserves bounded outcomes',
    async (_name, status, body, thrown, followed, unreadable) => {
      const target = status === 200 ? '/tim/never-say-a-word' : '/probe';
      const fixture = linkFixture(
        followed ? '/tim/listen' : target,
        attempt => {
          if (attempt <= thrown) throw new Error('offline');
          const response = new Response(body, { status });
          if (unreadable)
            vi.spyOn(response, 'text').mockRejectedValue(
              new Error('body interrupted')
            );
          return response;
        },
        target
      );
      const result = thrown
        ? await collectRetry(fixture)
        : await collect(fixture.fetcher);
      expect(result.failed).toBe(true);
      expect(fixture.calls()).toBe(thrown ? 2 : 1);
      const check = result.report.linkChecks[0];
      let observedStatus: number | null = status;
      if (thrown === 2) observedStatus = null;
      if (followed) observedStatus = 307;
      expect(check).toMatchObject({ status: observedStatus });
      if (status === 200 && thrown < 2 && !unreadable) {
        expect(result.brokenArtistLoops).toHaveLength(1);
        expect(check).toMatchObject({ canonicalArtistReturn: false });
      }
      if (followed)
        expect(check).toMatchObject({
          redirectedTo: releaseUrl,
          finalStatus: null,
        });
      if (thrown === 2 || unreadable)
        expect(check).toHaveProperty('error', 'link_probe_failed');
      else expect(check).not.toHaveProperty('error');
    }
  );
});
