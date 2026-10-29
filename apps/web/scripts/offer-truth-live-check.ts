#!/usr/bin/env tsx
/**
 * Live offer-truth check CLI. Compares production (or one exact deployment)
 * and Stripe's read-only view against the canonical offer.
 *
 *   tsx scripts/offer-truth-live-check.ts --base-url https://jov.ie --mode served --receipt out.json
 *
 * Exit: 0 pass, 1 mismatch (blocks release), 2 check unavailable (3-strike
 * alert + logged override policy), 3 uncertified (for example no Stripe key).
 * STRIPE_RO_KEY must be a restricted key (rk_...); a secret key is refused.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { offerSnapshot } from '../lib/billing/offer';
import {
  createStripeReader,
  type FetchedText,
  type OfferSnapshot,
  runOfferTruthCheck,
  type SurfaceEntry,
} from '../lib/billing/offer/live-check';
import {
  buildOriginBoundCookieRequest,
  buildOriginBoundProbeRequest,
  isExactVercelDeploymentUrl,
  parseProbeUrl,
  readExactHostCookieJar,
} from './vercel-protected-origin.cjs';

const here = dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 20_000;
const cookieRequest = buildOriginBoundCookieRequest as unknown as (
  url: URL,
  o: { cookieHeader: string; headers: Record<string, string> }
) => { url: URL; options: RequestInit };
const publicRequest = buildOriginBoundProbeRequest as unknown as (
  url: URL,
  o: { headers: Record<string, string> }
) => { url: URL; options: RequestInit };

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main(): Promise<number> {
  const baseUrl = parseProbeUrl(
    arg('base-url', process.env.BASE_URL ?? 'https://jov.ie') as string,
    'offer-truth base URL'
  );
  if (
    baseUrl.origin !== 'https://jov.ie' &&
    !isExactVercelDeploymentUrl(baseUrl)
  ) {
    throw new Error(
      'Offer-truth base URL must be canonical production or one trusted Jovie deployment origin.'
    );
  }
  const mode = arg('mode', 'served') as 'served' | 'checkout';
  const surfaces = (
    JSON.parse(
      readFileSync(
        arg(
          'surfaces',
          join(here, '../../../config/offer-surfaces.json')
        ) as string,
        'utf8'
      )
    ) as { surfaces: SurfaceEntry[] }
  ).surfaces;
  const headers = {
    Accept: '*/*',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    'User-Agent':
      'Mozilla/5.0 (compatible; JovieOfferTruth/1.0; +https://jov.ie)',
  };

  const fetchText = async (path: string): Promise<FetchedText> => {
    const target = parseProbeUrl(
      `${baseUrl.origin}${path}`,
      'offer-truth target'
    );
    const req = isExactVercelDeploymentUrl(target)
      ? cookieRequest(target, {
          cookieHeader: readExactHostCookieJar(
            process.env.VERCEL_PROBE_COOKIE_JAR,
            target
          ),
          headers,
        })
      : publicRequest(target, { headers });
    const res = await fetch(req.url, {
      ...req.options,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: res.status, body: await res.text() };
  };

  // checkout mode verifies the commit under test; served mode verifies what production serves.
  let expected: OfferSnapshot = offerSnapshot() as unknown as OfferSnapshot;
  if (mode === 'served') {
    const res = await fetchText('/api/offer');
    if (res.status !== 200) {
      console.error(
        `offer-truth: /api/offer returned HTTP ${res.status}; check unavailable`
      );
      return 2;
    }
    expected = JSON.parse(res.body) as OfferSnapshot;
  }

  const key = process.env.STRIPE_RO_KEY?.trim();
  if (key && !key.startsWith('rk_'))
    throw new Error(
      'STRIPE_RO_KEY must be a restricted key (rk_...); refusing to use another key type.'
    );
  const stripe = key ? createStripeReader(key) : null;

  const accept = (arg('accept-served-versions', '') as string)
    .split(',')
    .filter(Boolean);
  const receipt = await runOfferTruthCheck({
    expected,
    mode,
    fetchText,
    stripe,
    surfaces,
    acceptServedVersions: accept,
  });
  const out = arg('receipt');
  if (out) writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
  for (const c of receipt.checks)
    console.log(`[offer-truth] ${c.status.padEnd(11)} ${c.id}: ${c.detail}`);
  console.log(
    `[offer-truth] verdict=${receipt.verdict} exit=${receipt.exitCode} offer=${receipt.offer.version} ${receipt.offer.hash}`
  );
  return receipt.exitCode;
}

main().then(
  code => process.exit(code),
  error => {
    console.error(
      `offer-truth: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(2);
  }
);
