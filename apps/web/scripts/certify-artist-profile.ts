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
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

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
  const releaseSha =
    /(?:^|,)sentry-release=([a-f0-9]{40})(?:,|$)/.exec(baggage)?.[1] ?? null;
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
  }[] = [];
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
      'HTTP redirects are recorded but not certified as working destinations.',
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
      linkChecks.some(check => check.status !== 200),
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
