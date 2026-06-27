/**
 * Source-of-truth for the OAuth redirect URIs that MUST be registered in the
 * Google + Apple consoles for Clerk sign-in to work.
 *
 * Why this exists: Clerk hands Google/Apple a redirect_uri of
 * `https://<fapi-host>/v1/oauth_callback`, where the FAPI host is decoded from
 * the instance's publishable key. Those URIs must be registered in the Google
 * OAuth client + Apple Service ID consoles — which have NO CLI/API, so a human
 * (or the /auth-console-sync skill driving a browser) registers them. When the
 * FAPI host changes (e.g. a "staging unification"), the consoles drift and
 * production sign-in dies with `redirect_uri_mismatch` (the 2026-06-26 incident).
 *
 * This script prints the canonical checklist, and — when publishable keys are
 * present in the env (Doppler) — decodes the LIVE FAPI host and fails if it has
 * drifted from the committed snapshot. Run it before/after touching anything
 * Clerk-instance-shaped.
 *
 *   pnpm tsx scripts/auth-redirect-uris.ts                 # print checklist (+ live drift check if keys in env)
 *   pnpm tsx scripts/auth-redirect-uris.ts --json          # machine-readable
 *   pnpm tsx scripts/auth-redirect-uris.ts --self-test     # assert internal consistency, exit non-zero on failure
 *   doppler run --project jovie-web --config prd -- pnpm tsx scripts/auth-redirect-uris.ts   # decode live prod key too
 *
 * ponytail: self-contained CLI (no @/ alias from root scripts); the tiny decode
 * is duplicated from apps/web/lib/auth/decode-fapi-host.ts on purpose — the unit
 * test imports the real one and asserts they agree.
 */

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(
  __dirname,
  '../apps/web/lib/auth/oauth-redirect-uris.expected.json'
);

interface Snapshot {
  instances: Record<string, { appHost: string; fapiHost: string }>;
  google: {
    clientId: string;
    consoleUrl: string;
    requiredRedirectUris: string[];
  };
  apple: {
    serviceId: string;
    teamId: string;
    consoleUrl: string;
    requiredDomains: string[];
    requiredReturnUrls: string[];
  };
  native: { iosScheme: string };
}

const snapshot: Snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));

/** Decode the Clerk FAPI host from a publishable key (pk_(live|test)_<base64> -> <host>$). */
export function decodeFapiHost(pk: string | undefined | null): string | null {
  if (!pk) return null;
  const m = pk.match(/^pk_(live|test)_(.+)$/);
  if (!m?.[2]) return null;
  try {
    const decoded = Buffer.from(m[2], 'base64')
      .toString('utf8')
      .replace(/\$$/, '');
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

/** Build the console redirect_uri for a FAPI host. */
export const callbackUri = (fapiHost: string) =>
  `https://${fapiHost}/v1/oauth_callback`;

/**
 * Verify one instance's LIVE FAPI host against the committed snapshot.
 *
 * The env var that holds an instance's publishable key depends on the Doppler
 * config you run under: in `prd`, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is the prod
 * key; in `stg` it is the staging key. So drift can only be verified by running
 * this under the matching config and naming the instance:
 *   doppler ... --config prd -- tsx scripts/auth-redirect-uris.ts --verify prod
 *   doppler ... --config stg -- tsx scripts/auth-redirect-uris.ts --verify staging
 * Returns null when the host matches, or a {expected, actual} mismatch.
 */
export function verifyInstance(
  instance: string
): { expected: string; actual: string | null } | null {
  const expected = snapshot.instances[instance]?.fapiHost;
  if (!expected) throw new Error(`unknown instance "${instance}"`);
  const actual = decodeFapiHost(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return actual === expected ? null : { expected, actual };
}

/** Assert the snapshot is internally consistent: every required URI is a /v1/oauth_callback for a known FAPI host. */
export function selfTest(): void {
  const knownCallbacks = new Set(
    Object.values(snapshot.instances).map(i => callbackUri(i.fapiHost))
  );
  assert(
    snapshot.google.clientId.includes('.apps.googleusercontent.com'),
    'google.clientId malformed'
  );
  assert(snapshot.apple.serviceId.length > 0, 'apple.serviceId missing');
  assert(
    knownCallbacks.has(callbackUri(snapshot.instances.prod.fapiHost)),
    'prod callback not derivable'
  );
  for (const uri of snapshot.google.requiredRedirectUris) {
    assert(
      knownCallbacks.has(uri),
      `google requiredRedirectUri not derived from a known FAPI host: ${uri}`
    );
  }
  for (const uri of snapshot.apple.requiredReturnUrls) {
    assert(
      knownCallbacks.has(uri),
      `apple requiredReturnUrl not derived from a known FAPI host: ${uri}`
    );
  }
  // prod FAPI must always be covered by both consoles.
  const prodCb = callbackUri(snapshot.instances.prod.fapiHost);
  assert(
    snapshot.google.requiredRedirectUris.includes(prodCb),
    'prod callback missing from Google list'
  );
  assert(
    snapshot.apple.requiredReturnUrls.includes(prodCb),
    'prod callback missing from Apple list'
  );
}

function main() {
  const args = process.argv.slice(2);

  selfTest(); // always validate internal consistency first

  if (args.includes('--self-test')) {
    console.log('✅ auth-redirect-uris snapshot is internally consistent');
    return;
  }

  const verifyIdx = args.indexOf('--verify');
  if (verifyIdx !== -1) {
    const instance = args[verifyIdx + 1];
    if (!instance) {
      console.error('--verify requires an instance name (prod | staging)');
      process.exit(2);
    }
    const mismatch = verifyInstance(instance);
    if (!mismatch) {
      console.log(
        `✅ ${instance} FAPI host matches snapshot (${snapshot.instances[instance].fapiHost})`
      );
      return;
    }
    console.error(
      `❌ FAPI HOST DRIFT: ${instance} snapshot=${mismatch.expected} but live ` +
        `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY decodes to ${mismatch.actual ?? '(none/invalid)'}\n\n` +
        'The Google/Apple consoles are registered against the snapshot host.\n' +
        'Update apps/web/lib/auth/oauth-redirect-uris.expected.json AND re-run the\n' +
        '/auth-console-sync skill to register the new callbacks BEFORE shipping, or\n' +
        'production sign-in will break with redirect_uri_mismatch.'
    );
    process.exit(1);
  }

  if (args.includes('--json')) {
    console.log(JSON.stringify(snapshot, null, 2));
  } else {
    console.log('OAuth console redirect URIs — required registrations\n');
    console.log(`Google OAuth client: ${snapshot.google.clientId}`);
    console.log(`  console: ${snapshot.google.consoleUrl}`);
    console.log('  Authorized redirect URIs:');
    for (const u of snapshot.google.requiredRedirectUris)
      console.log(`    - ${u}`);
    console.log(
      `\nApple Service ID: ${snapshot.apple.serviceId} (team ${snapshot.apple.teamId})`
    );
    console.log(`  console: ${snapshot.apple.consoleUrl}`);
    console.log('  Domains:');
    for (const d of snapshot.apple.requiredDomains) console.log(`    - ${d}`);
    console.log('  Return URLs:');
    for (const u of snapshot.apple.requiredReturnUrls)
      console.log(`    - ${u}`);
    console.log(
      `\niOS native (Clerk-side allowlist, not a console): ${snapshot.native.iosScheme}`
    );

    const liveHost = decodeFapiHost(
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    );
    console.log(
      `\nLive FAPI host (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in this env): ${liveHost ?? '(no key in env)'}`
    );
    console.log(
      'Verify a specific instance with: --verify prod  (run under that instance’s Doppler config)'
    );
  }
}

main();
