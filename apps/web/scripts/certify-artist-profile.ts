#!/usr/bin/env tsx
/** Read-only founder certification. Run from repo root with pnpm --filter @jovie/web exec tsx scripts/certify-artist-profile.ts --output <directory> [--baseline <snapshot.json>] [--agent-surfaces]. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  discoveryApiSchema,
  inspectDiscoveryGuide,
  inspectPublicItem,
} from '@/lib/canaries/artist-discovery-proof';
import {
  artistProfileSnapshotSchema,
  compareArtistProfileSnapshots,
  inspectArtistProfile,
} from '@/lib/canaries/artist-profile-proof';
import {
  PROFILE_ROUTE_CONFIG,
  REDIRECT_SINK_ROUTE_KEYS,
} from '@/lib/profile/route-config';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

const STABLE_ARTIST_ROUTE =
  /^\/artists\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const TIM_WHITE_REFERENCE_RELEASE = new URL(
  '/tim/never-say-a-word',
  TIM_WHITE_PROFILE.publicProfileUrl
).href;

function hasCanonicalArtistReturn(html: string, url: string): boolean {
  const dom = new JSDOM(html, { url });
  const found = [...dom.window.document.querySelectorAll('a[href]')].some(
    link =>
      new URL(link.getAttribute('href') ?? '', url).href ===
        TIM_WHITE_PROFILE.publicProfileUrl &&
      (link.getAttribute('aria-label') ===
        `Back to ${TIM_WHITE_PROFILE.name}` ||
        link.textContent?.trim() === `Back to ${TIM_WHITE_PROFILE.name}`)
  );
  dom.window.close();
  return found;
}

/** JOV-6571 hide rules that have a stable marker in artist-site HTML. */
export const CANONICAL_DEFERRED_SURFACE_MARKERS = [
  [
    'tips',
    /data-testid=["'](?:tip-(?:button|drawer)|pay-trigger|profile-mode-drawer-pay|profile-pay-recipient)["']/,
  ],
  ['broad_ai', /data-ask-jovie-launcher|["']ask-jovie-(?:panel|trigger)["']/],
  ['operator_controls', /data-testid=["']operator-(?:banner|lists-nav)["']/],
] as const;

export function exposedDeferredSurfaces(html: string): string[] {
  return CANONICAL_DEFERRED_SURFACE_MARKERS.flatMap(([id, pattern]) =>
    pattern.test(html) ? [id] : []
  );
}

async function referenceReleaseFields(
  response: Response,
  pageUrl: string,
  surfaces: Set<string>
): Promise<{ canonicalArtistReturn?: boolean }> {
  if (pageUrl !== TIM_WHITE_REFERENCE_RELEASE) {
    await response.body?.cancel();
    return {};
  }
  const html = await response.text();
  for (const surfaceId of exposedDeferredSurfaces(html))
    surfaces.add(surfaceId);
  return { canonicalArtistReturn: hasCanonicalArtistReturn(html, pageUrl) };
}

/**
 * Redirects the codebase declares on purpose: the stable `/artists/:id`
 * entity route (survives claims and renames) and the profile mode
 * redirect-sinks registered in route-config. Only these get one followed
 * hop, and only to a same-origin 200. Every other redirect still fails.
 */
export function isDeclaredRedirect(url: URL, handle: string): boolean {
  if (STABLE_ARTIST_ROUTE.test(url.pathname)) return true;
  return REDIRECT_SINK_ROUTE_KEYS.some(
    key => PROFILE_ROUTE_CONFIG[key].buildPath(handle) === url.pathname
  );
}

async function deployedCommitSha(
  profileUrl: string,
  fetcher: typeof fetch
): Promise<string | null> {
  try {
    const response = await fetcher(
      new URL('/api/health/build-info', profileUrl).href,
      {
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
        redirect: 'manual',
      }
    );
    const body = (await response.json()) as { commitSha?: unknown };
    return typeof body.commitSha === 'string' &&
      /^[a-f0-9]{40}$/.test(body.commitSha)
      ? body.commitSha
      : null;
  } catch {
    return null;
  }
}

/** Opt-in expands this existing certification run, never a new scheduler/cohort. */
async function certifyDiscovery(
  profileHtml: string,
  output: string,
  id: string,
  fetcher: typeof fetch,
  profileReleaseSha: string | null
) {
  const profileUrl = TIM_WHITE_PROFILE.publicProfileUrl;
  const origin = new URL(profileUrl).origin;
  const handle = new URL(profileUrl).pathname.slice(1);
  const evidence: {
    url: string;
    method: string;
    status: number | null;
    sha256: string;
    file: string;
  }[] = [];
  const read = async (url: string, resource?: string) => {
    // A corrupt catalog may not redirect the collector onto an external host.
    if (new URL(url).origin !== origin)
      throw new Error('Off-origin discovery destination');
    const response = await fetcher(url, {
      method: resource ? 'POST' : 'GET',
      ...(resource
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: resource,
              method: 'resources/read',
              params: { uri: `artist://${handle}/${resource}` },
            }),
          }
        : {}),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
      redirect: 'manual',
    });
    const text = await response.text();
    const file = `${id}.discovery-${evidence.length}.txt`;
    evidence.push({
      url,
      method: resource ? 'POST' : 'GET',
      status: response.status,
      sha256: createHash('sha256').update(text).digest('hex'),
      file,
    });
    await writeFile(join(output, file), text, { flag: 'wx' });
    if (response.status !== 200)
      throw new Error(`Discovery HTTP ${response.status}`);
    return text;
  };
  try {
    const before = JSON.parse(await read(`${origin}/api/health/build-info`));
    const rawApi = JSON.parse(await read(`${origin}/api/v1/${handle}`));
    const api = discoveryApiSchema.parse(rawApi);
    const guide = await read(`${profileUrl}/llms.txt`);
    const dom = new JSDOM(profileHtml, { url: profileUrl });
    const guideChecks = inspectDiscoveryGuide({
      document: dom.window.document,
      guide,
      api,
      profileUrl,
      artistName: TIM_WHITE_PROFILE.name,
    });
    dom.window.close();
    const mcp: Record<string, unknown> = {};
    for (const resource of ['bio', 'releases', 'merch']) {
      const body = JSON.parse(
        await read(`${origin}/api/mcp/${handle}`, resource)
      );
      mcp[resource] = JSON.parse(body.result.contents[0].text);
    }
    const bio = mcp.bio as Record<string, unknown>;
    const mcpMatches =
      ['username', 'name', 'profileUrl', 'isClaimed', 'isVerified'].every(
        key => bio[key] === rawApi.artist[key]
      ) &&
      ['releases', 'merch'].every(
        key => JSON.stringify(mcp[key]) === JSON.stringify(rawApi[key])
      );
    const items = [];
    for (const [kind, catalog] of [
      ['release', api.releases],
      ['merch', api.merch],
    ] as const) {
      for (const item of catalog) {
        // An item must be a single release segment or an exact product segment.
        const path = new URL(item.url);
        const segments = path.pathname
          .slice(new URL(profileUrl).pathname.length + 1)
          .split('/');
        const exactPath =
          path.origin === origin &&
          path.pathname.startsWith(`${new URL(profileUrl).pathname}/`) &&
          !path.search &&
          !path.hash &&
          (kind === 'release'
            ? segments.length === 1 &&
              !REDIRECT_SINK_ROUTE_KEYS.some(
                key =>
                  PROFILE_ROUTE_CONFIG[key].buildPath(handle) === path.pathname
              )
            : segments.length === 2 &&
              segments[0] === 'merch' &&
              segments[1] === item.id);
        if (!exactPath) {
          items.push({
            url: item.url,
            passed: false,
            reason: 'collection_or_unsupported_item_url',
          });
          continue;
        }
        const html = await read(item.url);
        const page = new JSDOM(html, { url: item.url });
        items.push({
          url: item.url,
          ...inspectPublicItem(page.window.document, item, kind),
        });
        page.window.close();
      }
    }
    const after = JSON.parse(await read(`${origin}/api/health/build-info`));
    const stableBuild =
      typeof before.commitSha === 'string' &&
      /^[a-f0-9]{40}$/.test(before.commitSha) &&
      before.commitSha === after.commitSha &&
      before.commitSha === profileReleaseSha &&
      before.buildId === after.buildId &&
      before.deploymentId === after.deploymentId;
    return {
      evidence,
      releaseSha: before.commitSha ?? null,
      stableBuild,
      guideChecks,
      mcpMatches,
      items,
      failed:
        !stableBuild ||
        !guideChecks.identity ||
        guideChecks.missingLinks.length > 0 ||
        !guideChecks.latestMatches ||
        !mcpMatches ||
        items.some(item => !item.passed),
    };
  } catch (error) {
    return {
      evidence,
      failed: true,
      error:
        error instanceof Error ? error.message : 'Discovery proof unavailable',
    };
  }
}

export async function certifyArtistProfile(
  args: string[],
  fetcher: typeof fetch = fetch
) {
  const option = (name: string) => {
    const index = args.indexOf(name);
    const value = index >= 0 ? args[index + 1] : undefined;
    if (!value || value.startsWith('--'))
      throw new Error(`${name} requires a value`);
    return value;
  };
  if (!args.includes('--output') || !option('--output'))
    throw new Error('--output <directory> is required');
  const output = resolve(option('--output'));
  const started = Date.now();
  const observedAt = new Date().toISOString();
  const id = randomUUID();
  const response = await fetcher(TIM_WHITE_PROFILE.publicProfileUrl, {
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
    redirect: 'manual',
  });
  const html = await response.text();
  const deferredSurfaceIds = new Set(exposedDeferredSurfaces(html));
  const dom = new JSDOM(html, { url: TIM_WHITE_PROFILE.publicProfileUrl });
  const inspection = inspectArtistProfile({
    document: dom.window.document,
    html,
    httpStatus: response.status,
    profileUrl: TIM_WHITE_PROFILE.publicProfileUrl,
    artistName: TIM_WHITE_PROFILE.name,
    spotifyUrl: TIM_WHITE_PROFILE.spotifyUrl,
  });
  const baggage =
    dom.window.document
      .querySelector('meta[name="baggage"]')
      ?.getAttribute('content') ?? '';
  // Cache-HIT HTML carries no Sentry baggage, so fall back to the uncached
  // build-info endpoint of the same deployment to bind the release SHA.
  const releaseSha =
    /(?:^|,)sentry-release=([a-f0-9]{40})(?:,|$)/.exec(baggage)?.[1] ??
    (response.status === 200
      ? await deployedCommitSha(TIM_WHITE_PROFILE.publicProfileUrl, fetcher)
      : null);
  const snapshot = artistProfileSnapshotSchema.parse({
    schema: 'jovie-public-artist-integrity/v2',
    id,
    observedAt,
    profileUrl: TIM_WHITE_PROFILE.publicProfileUrl,
    artistName: TIM_WHITE_PROFILE.name,
    spotifyUrl: TIM_WHITE_PROFILE.spotifyUrl,
    releaseSha,
    htmlSha256: createHash('sha256').update(html).digest('hex'),
    ...inspection,
  });
  dom.window.close();
  const internalLinks = snapshot.links.filter(
    url => new URL(url).origin === new URL(snapshot.profileUrl).origin
  );
  const linkChecks: {
    url: string;
    status: number | null;
    observedAt: string;
    redirectedTo?: string;
    finalStatus?: number | null;
    canonicalArtistReturn?: boolean;
  }[] = [];
  const origin = new URL(snapshot.profileUrl).origin;
  const handle = new URL(snapshot.profileUrl).pathname.slice(1);
  // Bounded concurrency, same-origin URLs only. External links are inventory, not verification.
  for (let offset = 0; offset < internalLinks.length; offset += 4) {
    linkChecks.push(
      ...(await Promise.all(
        internalLinks.slice(offset, offset + 4).map(async url => {
          try {
            const result = await fetcher(url, {
              signal: AbortSignal.timeout(15_000),
              redirect: 'manual',
            });
            const location = result.headers.get('location');
            if (
              result.status >= 300 &&
              result.status < 400 &&
              location &&
              isDeclaredRedirect(new URL(url), handle)
            ) {
              await result.body?.cancel();
              const target = new URL(location, url);
              if (target.origin !== origin) {
                return {
                  url,
                  status: result.status,
                  observedAt: new Date().toISOString(),
                  redirectedTo: target.href,
                  finalStatus: null,
                };
              }
              const final = await fetcher(target.href, {
                signal: AbortSignal.timeout(15_000),
                redirect: 'manual',
              });
              return {
                url,
                status: result.status,
                observedAt: new Date().toISOString(),
                redirectedTo: target.href,
                finalStatus: final.status,
                ...(await referenceReleaseFields(
                  final,
                  target.href,
                  deferredSurfaceIds
                )),
              };
            }
            return {
              url,
              status: result.status,
              observedAt: new Date().toISOString(),
              ...(await referenceReleaseFields(
                result,
                url,
                deferredSurfaceIds
              )),
            };
          } catch {
            return { url, status: null, observedAt: new Date().toISOString() };
          }
        })
      ))
    );
  }
  await mkdir(output, { recursive: true });
  const discovery = args.includes('--agent-surfaces')
    ? await certifyDiscovery(html, output, id, fetcher, snapshot.releaseSha)
    : null;
  const baseline = args.includes('--baseline')
    ? JSON.parse(await readFile(resolve(option('--baseline')), 'utf8'))
    : null;
  const comparison = baseline
    ? compareArtistProfileSnapshots(baseline, snapshot)
    : null;
  const report = {
    snapshot,
    response: {
      requestedUrl: TIM_WHITE_PROFILE.publicProfileUrl,
      finalUrl: response.url,
      status: response.status,
      location: response.headers.get('location'),
    },
    comparison,
    discovery,
    linkChecks,
    elapsedMs: Date.now() - started,
    publicationApproved: false,
    accountOwnership: 'unverified',
    searchVisibilityScore: null,
    action: null,
    attribution: 'unverified',
    externalLinkVerification: 'not_performed',
    limitations: [
      'Public HTTP integrity only; not search ranking, revenue lift, authenticated Presence, or full artist/media graph certification.',
      'A comparable observed delta alone does not establish causal attribution or permission to publish.',
      'Only declared redirects (stable /artists/:id, route-config redirect-sinks) are followed, one same-origin hop to a 200; any other redirect fails.',
    ],
  };
  await mkdir(output, { recursive: true });
  await writeFile(join(output, `${id}.html`), html, { flag: 'wx' });
  await writeFile(
    join(output, `${id}.snapshot.json`),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    { flag: 'wx' }
  );
  await writeFile(
    join(output, `${id}.report.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    { flag: 'wx' }
  );
  return {
    reportPath: join(output, `${id}.report.json`),
    snapshotPath: join(output, `${id}.snapshot.json`),
    checks: snapshot.checks,
    discovery,
    comparison,
    brokenInternalLinks: linkChecks.filter(
      check => check.status === 404 || check.status === 410
    ),
    brokenArtistLoops: linkChecks.filter(
      check => check.canonicalArtistReturn === false
    ),
    exposedDeferredSurfaces: [...deferredSurfaceIds].sort(),
    elapsedMs: report.elapsedMs,
    failed:
      discovery?.failed === true ||
      snapshot.checks.some(check => check.status !== 'pass') ||
      linkChecks.some(
        check => check.status !== 200 && check.finalStatus !== 200
      ) ||
      linkChecks.some(check => check.canonicalArtistReturn === false),
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  certifyArtistProfile(process.argv.slice(2))
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      if (result.failed) process.exitCode = 1;
    })
    .catch(error => {
      console.error(
        error instanceof Error ? error.message : 'Certification failed'
      );
      process.exitCode = 1;
    });
}
