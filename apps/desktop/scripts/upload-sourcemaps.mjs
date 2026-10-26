#!/usr/bin/env node
/**
 * Uploads dist-electron sourcemaps to Sentry for the release the app reports
 * (jovie-desktop@<version>, dist = first 12 chars of the source revision).
 * Skips cleanly without SENTRY_AUTH_TOKEN so local and fork builds are unaffected.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function sourcemapUploadPlan(env, identity) {
  if (!env.SENTRY_AUTH_TOKEN || !env.SENTRY_ORG || !env.SENTRY_PROJECT)
    return null;
  if (identity.channel === 'local' || !identity.version) return null;
  const release = `jovie-desktop@${identity.version}`;
  const dist = identity.sourceRevision
    ? identity.sourceRevision.slice(0, 12)
    : null;
  return {
    release,
    args: [
      'sourcemaps',
      'upload',
      '--org',
      env.SENTRY_ORG,
      '--project',
      env.SENTRY_PROJECT,
      '--release',
      release,
      ...(dist ? ['--dist', dist] : []),
      join(root, 'dist-electron'),
    ],
  };
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  const identity = JSON.parse(
    readFileSync(join(root, 'build', 'build-identity.json'), 'utf8')
  );
  const plan = sourcemapUploadPlan(process.env, identity);
  if (!plan) {
    console.log(
      '[sentry-sourcemaps] skipped: no upload credentials or local build'
    );
  } else {
    execFileSync('pnpm', ['exec', 'sentry-cli', ...plan.args], {
      stdio: 'inherit',
    });
    console.log(`[sentry-sourcemaps] uploaded for ${plan.release}`);
  }
}
