#!/usr/bin/env tsx
/**
 * Live agent-path certification for the Jovie agent MCP.
 *
 *   pnpm --filter @jovie/web agent-path:cert -- --base https://jov.ie \
 *     [--query <exact-spotify-artist-url>] [--release-url <url>] [--out receipt.json]
 *
 * Defaults use an exact artist URL plus matching release_metadata so
 * prepare_launch can reach launch_draft_ready without ambiguous name search.
 *
 * Claim persistence + fixture cleanup (JOV-9760) inject the Golden Path
 * canary claim walk when CRON_SECRET, SYNTHETIC_PASSAGE_KEY, and DATABASE_URL
 * are present; without them those checks SKIP (`claim-walk-secrets`).
 *
 * Production (Tim / symphony on `Production – jovie` — names only):
 *
 *   doppler run --project jovie-web --config prd \
 *     --only-secrets=CRON_SECRET,DATABASE_URL --no-fallback -- \
 *     env -u DOPPLER_TOKEN bash -lc '
 *       export GITHUB_ENV=$(mktemp)
 *       node scripts/synthetic-passage-key.mjs
 *       set -a; . "$GITHUB_ENV"; set +a
 *       pnpm --filter @jovie/web agent-path:cert -- --base https://jov.ie \
 *         --out agent-path-cert.json
 *     '
 *
 * Exit 1 on any FAIL or incomplete check, 75 on RATE_LIMITED, 2 on fatal.
 */
import { writeFile } from 'node:fs/promises';
import { CERT_DEFAULT_ARTIST_URL } from '@/lib/agent-distribution/cert-fixtures';
import { runCert } from '@/lib/agent-distribution/cert-run';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

function optionalArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  const value = index > 0 ? process.argv[index + 1] : undefined;
  return value && value.length > 0 ? value : undefined;
}

async function main() {
  const { receipt, exitCode } = await runCert({
    base: arg('base', 'https://jov.ie'),
    query: arg('query', CERT_DEFAULT_ARTIST_URL),
    // Prefer metadata-only prepare_launch unless the caller forces a URL.
    releaseUrl: optionalArg('release-url'),
  });
  const out = arg('out', '');
  if (out) await writeFile(out, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
  return exitCode;
}

main().then(
  code => process.exit(code),
  error => {
    console.error(JSON.stringify({ fatal: String(error) }));
    process.exit(2);
  }
);
