#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
// Artifact identity covers build inputs, never cache transport credentials.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// All NEXT_* (including NEXT_PUBLIC_*) and E2E_* are included, even when
// Turbo's strict env filtering currently drops one: expanding that allowlist
// must never make an old artifact reusable. Include other config/prerender
// inputs too. Runtime DB credentials are explicitly cleared in artifact
// verification steps: those steps declare the build env, not the server env.
// An empty DATABASE_URL is normalized to absent (the no-DB build profile);
// empty NEXT/E2E values remain distinct inputs.
const BUILD_INPUT =
  /^(NEXT_|E2E_|VERCEL_|SENTRY_|STATSIG_|FLAGS_|FEATURE_|EXPERIMENTATION_|BETTER_AUTH_|AUTH_|DATABASE_|STRIPE_|SPOTIFY_|RESEND_|BLOB_|REVENUECAT_|NEON_)/;
const OTHER_INPUTS = new Set([
  'NODE_ENV',
  'CI',
  'GITHUB_ACTIONS',
  'ANALYZE',
  'SKIP_SKILLS_CATALOG_SYNC',
  'PUBLIC_NOAUTH_SMOKE',
  'LEGAL_MAILING_ADDRESS',
  'DEMO_RECORDING',
  'DEMO_VIDEO_URL',
  'DEMO_VIDEO_POSTER_URL',
  'INVESTOR_CONTENT_DIR',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'VERCEL',
  'PROFILE_MODE_PRERENDER_HANDLES',
  'URL_ENCRYPTION_KEY',
  'AI_GATEWAY_API_KEY',
]);
// TURBO_* controls cache reads/writes/transport, not rendered output. In MQ
// TURBO_CACHE=local:r; artifact correctness does not depend on remote hits.
export function buildEnvHash(
  env,
  { lockfile, nodeMajor = process.versions.node.split('.')[0] }
) {
  const inputs = { ...env, NODE_ENV: env.NODE_ENV || 'production' };
  const sorted = Object.keys(inputs)
    .filter(
      key =>
        (BUILD_INPUT.test(key) || OTHER_INPUTS.has(key)) &&
        inputs[key] != null &&
        !(key === 'DATABASE_URL' && inputs[key] === '')
    )
    .sort()
    .map(key => [key, String(inputs[key])]);
  return createHash('sha256')
    .update(
      JSON.stringify({
        env: sorted,
        nodeMajor: String(nodeMajor),
        lockHash: createHash('sha256').update(lockfile).digest('hex'),
      })
    )
    .digest('hex');
}

export function main(args, env = process.env, root = process.cwd()) {
  const [mode, profile] = args;
  if (
    !['hash', 'write', 'verify'].includes(mode) ||
    !profile ||
    args.length !== 2
  )
    throw new Error('usage: web-build-env-hash.mjs hash|write|verify PROFILE');
  const envHash = buildEnvHash(env, {
    lockfile: readFileSync(resolve(root, 'pnpm-lock.yaml')),
  });
  if (mode === 'hash') {
    console.log(envHash);
    return;
  }
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  if (!/^[a-f0-9]{40}$/.test(sha) || (env.GITHUB_SHA && env.GITHUB_SHA !== sha))
    throw new Error('checked-out HEAD does not match exact GITHUB_SHA');
  const file = resolve(root, 'apps/web/.next/jovie-build-manifest.json');
  const expected = {
    sha,
    envHash,
    profile,
    runId: env.GITHUB_RUN_ID || '',
    runAttempt: env.GITHUB_RUN_ATTEMPT || '',
  };
  if (mode === 'write') {
    writeFileSync(file, `${JSON.stringify(expected, null, 2)}\n`);
  } else {
    const actual = JSON.parse(readFileSync(file, 'utf8'));
    for (const key of Object.keys(expected)) {
      if (actual[key] !== expected[key])
        throw new Error(`web build manifest ${key} mismatch`);
    }
  }
  console.log(
    `Web build ${mode}: sha=${sha} envHash=${envHash} profile=${profile}`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
