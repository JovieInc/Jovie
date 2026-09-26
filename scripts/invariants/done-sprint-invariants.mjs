#!/usr/bin/env node
/**
 * JOV-INV-033: Done sprint invariants are release blockers.
 *
 * Linear Done is not production-true. Seed catalog is JOV-6218 (pricing
 * truth) and JOV-6260 (directory hygiene). Missing files, missing claims,
 * scanner errors, and production contradictions fail closed.
 *
 * Source mode is composed into `scripts/invariants/validate.mjs`.
 * Release mode (`--release` / DONE_INVARIANT_RESCAN=release) rescans live
 * pages and is the production-controller release blocker.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readInvariantRegistry } from './registry.mjs';

export const DONE_SPRINT_INVARIANT_ID = 'JOV-INV-033';
export const DONE_SPRINT_SCHEMA = 'jovie-done-sprint-invariants/v1';
export const DONE_SPRINT_SLUG = 'jovie/coordination/done-sprint-invariants-v1';

const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DEFAULT_PRODUCTION_PATHS = Object.freeze(['/pricing', '/artists', '/']);
const FORBIDDEN_PUBLIC_OFFERS = Object.freeze([
  '/signup?plan=max',
  'signup?plan=max',
  '/signup?plan=pro&interval=year',
  '/signup?plan=pro&interval=annual',
]);
const ARTIST_VISIBILITY_OFFER_CONTRACT_ID =
  'artist-visibility-offer-contract-v1';
const FORBIDDEN_PRICING_PAGE_MARKERS = Object.freeze([
  '$149',
  '149/mo',
  'Max Early Access',
  'marketing-pricing-plan-max',
]);
const REQUIRED_PRICING_PAGE_MARKERS = Object.freeze([
  ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
  '$199',
  'Request access',
]);
const FORBIDDEN_DIRECTORY_IDENTITIES = Object.freeze([
  'e2e+jordan@example.com',
  '+clerk_test',
  'tmoc0g1x9dwmk71',
]);

export const SEED_DONE_INVARIANTS = Object.freeze([
  Object.freeze({
    linearId: 'JOV-6218',
    title: 'Pricing truth',
    files: Object.freeze([
      'apps/web/lib/billing/offer-truth.ts',
      'apps/web/lib/billing/offer-truth.test.ts',
      'apps/web/data/marketingPricingPlans.ts',
      'apps/web/constants/plans.ts',
    ]),
    required: Object.freeze([
      'isMaxPurchaseEnabled(): boolean {\n  return false;',
      "return 'contact_sales'",
      'PRO_TRIAL_DURATION_DAYS = 14',
      "plan === 'pro' && validateBillingInterval(interval) === 'month'",
      'Only monthly Pro is available for new subscriptions',
      'rejects stale annual and Max signup offers',
      ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
    ]),
    forbidden: FORBIDDEN_PUBLIC_OFFERS,
  }),
  Object.freeze({
    linearId: 'JOV-6260',
    title: 'Directory hygiene',
    files: Object.freeze([
      'apps/web/lib/profile/public-discovery-catalog.ts',
      'apps/web/lib/profile/public-profile-indexing-policy.ts',
      'apps/web/lib/cache/profile.ts',
      'apps/web/lib/profile/public-discovery-catalog.test.ts',
      'apps/web/lib/cache/profile.test.ts',
    ]),
    required: Object.freeze([
      'filterPublicDiscoveryIdentities',
      'test_account_email',
      'private_or_unpublished',
      'ARTISTS_DIRECTORY',
      'artists directory catalog (JOV-6260)',
      'invalidateProfileCache discovery outputs (JOV-6260)',
    ]),
    forbidden: Object.freeze([]),
  }),
]);

export function resolveDoneSprintRescanMode({
  argv = process.argv,
  env = process.env,
} = {}) {
  if (argv.includes('--release') || env.DONE_INVARIANT_RESCAN === 'release') {
    return 'release';
  }
  return 'source';
}

function readRepoFile(repoRoot, relativePath) {
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) return null;
  return readFileSync(absolutePath, 'utf8');
}

export function scanDoneSprintSources(repoRoot = DEFAULT_ROOT) {
  const errors = [];
  if (!Array.isArray(SEED_DONE_INVARIANTS) || SEED_DONE_INVARIANTS.length < 2) {
    return ['done-sprint: seed catalog is empty; fail closed'];
  }

  for (const item of SEED_DONE_INVARIANTS) {
    const combined = [];
    for (const file of item.files) {
      const source = readRepoFile(repoRoot, file);
      if (source === null) {
        errors.push(
          `done-sprint ${item.linearId}: missing ${file}; fail closed`
        );
        continue;
      }
      combined.push(source);
    }
    const blob = combined.join('\n');
    for (const claim of item.required) {
      if (!blob.includes(claim)) {
        errors.push(
          `done-sprint ${item.linearId}: missing claim ${JSON.stringify(claim)}`
        );
      }
    }
    for (const forbidden of item.forbidden) {
      if (blob.includes(forbidden)) {
        errors.push(
          `done-sprint ${item.linearId}: published surface still offers ${forbidden}`
        );
      }
    }
  }

  return errors;
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: Function,
 *   paths?: readonly string[],
 * }} [options]
 */
export async function rescanProduction({
  env = process.env,
  fetchImpl = fetch,
  paths = DEFAULT_PRODUCTION_PATHS,
} = {}) {
  const baseUrl = (env.DONE_INVARIANT_PRODUCTION_BASE_URL || '').replace(
    /\/$/,
    ''
  );
  if (!baseUrl) {
    return [
      'done-sprint: release rescan required but DONE_INVARIANT_PRODUCTION_BASE_URL is missing; fail closed',
    ];
  }

  const errors = [];
  let fetched = 0;
  for (const path of paths) {
    const url = `${baseUrl}${path}`;
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { Accept: 'text/html' },
        redirect: 'follow',
      });
    } catch (error) {
      errors.push(
        `done-sprint: production fetch ${url} failed (${error instanceof Error ? error.message : String(error)}); fail closed`
      );
      continue;
    }
    if (!response?.ok) {
      errors.push(
        `done-sprint: production ${url} returned HTTP ${response?.status ?? 'unknown'}; fail closed`
      );
      continue;
    }
    fetched += 1;
    const body = await response.text();
    if (path === '/pricing' || path === '/') {
      for (const forbidden of FORBIDDEN_PUBLIC_OFFERS) {
        if (body.includes(forbidden)) {
          errors.push(
            `done-sprint JOV-6218: production ${url} still offers ${forbidden}`
          );
        }
      }
    }
    if (path === '/pricing') {
      for (const marker of FORBIDDEN_PRICING_PAGE_MARKERS) {
        if (body.includes(marker)) {
          errors.push(
            `done-sprint JOV-6218: production ${url} still shows ${marker} (${ARTIST_VISIBILITY_OFFER_CONTRACT_ID})`
          );
        }
      }
      for (const marker of REQUIRED_PRICING_PAGE_MARKERS) {
        if (!body.includes(marker)) {
          errors.push(
            `done-sprint JOV-6218: production ${url} missing ${marker} (${ARTIST_VISIBILITY_OFFER_CONTRACT_ID})`
          );
        }
      }
    }
    if (path === '/artists') {
      for (const identity of FORBIDDEN_DIRECTORY_IDENTITIES) {
        if (body.includes(identity)) {
          errors.push(
            `done-sprint JOV-6260: production ${url} still lists ${identity}`
          );
        }
      }
    }
  }

  if (fetched === 0) {
    errors.push(
      'done-sprint: production rescan fetched zero pages; fail closed'
    );
  }
  return errors;
}

/**
 * @param {{
 *   repoRoot?: string,
 *   registry?: ReturnType<typeof readInvariantRegistry>,
 *   mode?: 'source' | 'release',
 *   env?: NodeJS.ProcessEnv,
 *   argv?: string[],
 *   fetchImpl?: Function,
 * }} [options]
 */
export async function validateDoneSprintInvariants({
  repoRoot = DEFAULT_ROOT,
  registry,
  mode,
  env = process.env,
  argv = process.argv,
  fetchImpl = fetch,
} = {}) {
  const errors = [];
  const resolvedRegistry = registry ?? readInvariantRegistry(repoRoot);
  const invariant = resolvedRegistry.invariants.find(
    item => item.id === DONE_SPRINT_INVARIANT_ID
  );
  if (!invariant) {
    return ['done-sprint: JOV-INV-033 is missing from the registry'];
  }
  if (invariant.policy?.value?.schema !== DONE_SPRINT_SCHEMA) {
    errors.push('done-sprint: registry schema does not match the scanner');
  }

  errors.push(...scanDoneSprintSources(repoRoot));

  const resolvedMode = mode ?? resolveDoneSprintRescanMode({ argv, env });
  if (resolvedMode === 'release') {
    errors.push(...(await rescanProduction({ env, fetchImpl })));
  }
  return errors;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const errors = await validateDoneSprintInvariants();
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`done-sprint: ${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Done sprint invariants valid: ${SEED_DONE_INVARIANTS.length} seed issues.\n`
    );
  }
}
