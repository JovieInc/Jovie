#!/usr/bin/env tsx
/** Read-only founder certification. Run from repo root with pnpm --filter @jovie/web exec tsx scripts/certify-artist-profile.ts --output <directory> [--baseline <snapshot.json>]. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
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
            await result.body?.cancel();
            const location = result.headers.get('location');
            if (
              result.status >= 300 &&
              result.status < 400 &&
              location &&
              isDeclaredRedirect(new URL(url), handle)
            ) {
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
              await final.body?.cancel();
              return {
                url,
                status: result.status,
                observedAt: new Date().toISOString(),
                redirectedTo: target.href,
                finalStatus: final.status,
              };
            }
            return {
              url,
              status: result.status,
              observedAt: new Date().toISOString(),
            };
          } catch {
            return { url, status: null, observedAt: new Date().toISOString() };
          }
        })
      ))
    );
  }
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
    comparison,
    brokenInternalLinks: linkChecks.filter(
      check => check.status === 404 || check.status === 410
    ),
    elapsedMs: report.elapsedMs,
    failed:
      snapshot.checks.some(check => check.status !== 'pass') ||
      linkChecks.some(
        check => check.status !== 200 && check.finalStatus !== 200
      ),
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
