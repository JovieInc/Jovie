/**
 * Source-of-truth for the OAuth redirect URIs that MUST be registered in the
 * Google + Apple consoles for Better Auth sign-in to work.
 *
 * Why this exists: Better Auth hands Google/Apple a redirect_uri of
 * `https://<appHost>/api/auth/callback/<provider>`. Those URIs must be in
 * the Google OAuth client + Apple Service ID consoles — which have NO
 * CLI/API, so a human (or the /auth-console-sync skill driving a browser)
 * registers them. When an app host changes (e.g. a domain move), the
 * consoles drift and production sign-in dies with
 * `redirect_uri_mismatch` (the 2026-06-26 incident class).
 *
 * This script prints the canonical checklist and asserts the committed
 * snapshot is internally consistent. The old Clerk-era version decoded the
 * FAPI host from the live publishable key; the Better Auth path has no
 * publishable key to decode, so the live-drift check is gone — the canary
 * (staging OAuth probe) + production-oauth-gate are the runtime safety net.
 *
 *   pnpm tsx scripts/auth-redirect-uris.ts                 # print checklist
 *   pnpm tsx scripts/auth-redirect-uris.ts --json          # machine-readable
 *   pnpm tsx scripts/auth-redirect-uris.ts --self-test     # assert internal consistency, exit non-zero on failure
 *
 * ponytail: self-contained CLI (no @/ alias from root scripts).
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

type Provider = 'google' | 'apple';

interface Snapshot {
  instances: Record<string, { appHost: string }>;
  google: {
    clientId: string;
    consoleUrl: string;
    requiredRedirectUris: string[];
    requiredJsOrigins: string[];
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

/** Build the console redirect_uri for an app host + provider. */
export const callbackUri = (appHost: string, provider: Provider) =>
  `https://${appHost}/api/auth/callback/${provider}`;

/** Same scheme/host used for Google's authorized JavaScript origins (One Tap). */
export const jsOrigin = (appHost: string) =>
  appHost === 'localhost:3100' ? 'http://localhost:3100' : `https://${appHost}`;

/** Assert the snapshot is internally consistent: every URI derives from a known app host. */
export function selfTest(): void {
  assert(
    Object.keys(snapshot.instances).includes('prod'),
    'prod instance missing from snapshot.instances'
  );
  assert(
    Object.keys(snapshot.instances).includes('staging'),
    'staging instance missing from snapshot.instances'
  );

  const appHosts = new Set(
    Object.values(snapshot.instances).map(i => i.appHost)
  );
  // localhost is allowed for the Google dev redirect URI but is NOT a deployment instance.
  const googleAppHosts = new Set([...appHosts, 'localhost:3100']);

  assert(
    snapshot.google.clientId.includes('.apps.googleusercontent.com'),
    'google.clientId malformed'
  );
  assert(snapshot.apple.serviceId.length > 0, 'apple.serviceId missing');
  assert(snapshot.apple.teamId.length > 0, 'apple.teamId missing');

  for (const uri of snapshot.google.requiredRedirectUris) {
    const host = extractAppHost(uri);
    assert(
      host != null && googleAppHosts.has(host),
      `google requiredRedirectUri not derived from a known app host: ${uri}`
    );
    assert(
      uri.endsWith('/api/auth/callback/google'),
      `google requiredRedirectUri must end with /api/auth/callback/google: ${uri}`
    );
  }
  for (const origin of snapshot.google.requiredJsOrigins) {
    const host = extractAppHost(origin);
    assert(
      host != null &&
        googleAppHosts.has(host) &&
        (origin.startsWith('http://localhost') ||
          origin.startsWith('https://')),
      `google requiredJsOrigin not derived from a known app host: ${origin}`
    );
  }
  for (const uri of snapshot.apple.requiredReturnUrls) {
    const host = extractAppHost(uri);
    assert(
      host != null && appHosts.has(host),
      `apple requiredReturnUrl not derived from a known deployment app host: ${uri}`
    );
    assert(
      uri.endsWith('/api/auth/callback/apple'),
      `apple requiredReturnUrl must end with /api/auth/callback/apple: ${uri}`
    );
  }

  // Prod callbacks must always be covered by both consoles.
  const prodHost = snapshot.instances.prod.appHost;
  const prodGoogle = callbackUri(prodHost, 'google');
  const prodApple = callbackUri(prodHost, 'apple');
  assert(
    snapshot.google.requiredRedirectUris.includes(prodGoogle),
    'prod Google callback missing from snapshot'
  );
  assert(
    snapshot.apple.requiredReturnUrls.includes(prodApple),
    'prod Apple callback missing from snapshot'
  );

  // Apple domains must include the host of every Apple return URL.
  for (const uri of snapshot.apple.requiredReturnUrls) {
    const host = extractAppHost(uri);
    assert(
      host != null && snapshot.apple.requiredDomains.includes(host),
      `apple requiredDomains missing ${host} for return URL ${uri}`
    );
  }
}

/** Strip the scheme + path to leave the host (e.g. `jov.ie`) of a URL string. Returns null if unparseable. */
function extractAppHost(uri: string): string | null {
  try {
    return new URL(uri).host;
  } catch {
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);

  selfTest(); // always validate internal consistency first

  if (args.includes('--self-test')) {
    console.log('✅ auth-redirect-uris snapshot is internally consistent');
    return;
  }

  if (args.includes('--json')) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  console.log('OAuth console redirect URIs — required registrations\n');
  console.log(`Google OAuth client: ${snapshot.google.clientId}`);
  console.log(`  console: ${snapshot.google.consoleUrl}`);
  console.log('  Authorized redirect URIs:');
  for (const u of snapshot.google.requiredRedirectUris)
    console.log(`    - ${u}`);
  console.log('  Authorized JavaScript origins (One Tap):');
  for (const o of snapshot.google.requiredJsOrigins) console.log(`    - ${o}`);
  console.log(
    `\nApple Service ID: ${snapshot.apple.serviceId} (team ${snapshot.apple.teamId})`
  );
  console.log(`  console: ${snapshot.apple.consoleUrl}`);
  console.log('  Domains:');
  for (const d of snapshot.apple.requiredDomains) console.log(`    - ${d}`);
  console.log('  Return URLs:');
  for (const u of snapshot.apple.requiredReturnUrls) console.log(`    - ${u}`);
  console.log(
    `\niOS deep-link scheme (PKCE native handoff, not a console): ${snapshot.native.iosScheme}`
  );
}

main();
