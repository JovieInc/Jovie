/**
 * agentcookie integration — session/credential sync from daily-driver Pro to Air.
 *
 * One-way: Pro (sender) → Air (receiver) over Tailscale.
 * Encrypted: AES-256-GCM (mvanhorn/agentcookie).
 *
 * Security posture: sync ONLY the sessions Jovie agents actually need.
 * Everything else is blocked. See COOKIE_BLOCKLIST and COOKIE_ALLOWLIST.
 *
 * Tim-approved: tim-approved label on GH#10930.
 *
 * Blast-radius mitigations:
 *   - Receiver only accepts connections from Tailscale range (--tailscale-only)
 *   - Blocklist covers banking, healthcare, and high-blast-radius identity providers
 *   - Allowlist is default-deny: only explicitly listed domains are synced
 *   - API key allowlist is strict: only Jovie-workflow tokens, no cloud-root IAM
 *
 * ToS note: session cookies used for scraping bear account-ban risk. Pair
 * with the ToS go/no-go (GH#10930) before using synced sessions for scraping.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { AGENTCOOKIE_COOKIES_DIR, AGENTCOOKIE_STATE_DIR } from './hermes-paths';

// ─── Ports ────────────────────────────────────────────────────────────────────

/** Tailscale-only receiver port on the Air. Not exposed on public interfaces. */
export const AGENTCOOKIE_PORT = 17_070;

// ─── Security policy ──────────────────────────────────────────────────────────

/**
 * Domains whose cookies are NEVER synced to the agent box, regardless of
 * what appears in COOKIE_ALLOWLIST.
 *
 * If the agent box is compromised, cookies for these domains allow:
 *   - Drain bank accounts (banking rows)
 *   - Access health records (healthcare rows)
 *   - Compromise all other accounts via credential manager (password-manager rows)
 *   - Take over identity (gov / IRS rows)
 *   - AWS/GCP root console escalation (cloud-root rows)
 *
 * Keep this list conservative. Re-authing on the agent box is cheaper than
 * recovering from a credential compromise.
 */
export const COOKIE_BLOCKLIST: ReadonlyArray<string> = [
  // Banking / financial institutions
  'chase.com',
  'wellsfargo.com',
  'bankofamerica.com',
  'schwab.com',
  'fidelity.com',
  'vanguard.com',
  'capitalone.com',
  'citibank.com',
  'usaa.com',
  'paypal.com',
  'venmo.com',
  'cashapp.com',
  'zelle.com',
  'wealthfront.com',
  'betterment.com',
  'robinhood.com',
  'coinbase.com',
  // Stripe dashboard — Jovie uses API keys, not session cookies
  'dashboard.stripe.com',
  'mercury.com',
  'brex.com',
  'ramp.com',
  'amex.com',
  'discover.com',
  'ally.com',

  // Tax / government / legal identity
  'irs.gov',
  'turbotax.com',
  'hrblock.com',
  'taxact.com',
  'ssa.gov',
  'healthcare.gov',
  'login.gov',
  'id.me',

  // Healthcare
  'mychart.com',
  'mychart.org',
  'myhealthevet.va.gov',
  'unitedhealth.com',
  'anthem.com',
  'cigna.com',
  'aetna.com',
  'kaiserpermanente.org',

  // Password managers — if these leak, every other account is reachable
  '1password.com',
  'lastpass.com',
  'bitwarden.com',
  'dashlane.com',
  'keeper.io',
  'keepersecurity.com',
  'nordpass.com',

  // Cloud root / IAM — API keys cover what Jovie needs; root console sessions too risky
  'console.aws.amazon.com',
  'us-east-1.console.aws.amazon.com',
  'console.cloud.google.com',
  'portal.azure.com',

  // Apple personal identity
  'appleid.apple.com',
  'icloud.com',

  // Personal social (not Jovie product sessions)
  'facebook.com',
  'instagram.com',
];

/**
 * Allowed cookie domains — only these are synced to the agent box.
 *
 * Default-deny: anything not on this list is rejected, even if absent from
 * COOKIE_BLOCKLIST. This prevents future cookie drift.
 *
 * Only add domains when a Jovie workflow explicitly needs the session.
 */
export const COOKIE_ALLOWLIST: ReadonlyArray<string> = [
  // Authenticated analytics (unblocks GH#10926 / last30days)
  'artists.spotify.com',
  'analytics.spotify.com',
  'artists.apple.com',

  // Google Analytics / Search Console (for Jovie metrics dashboards)
  'analytics.google.com',
  'search.google.com',

  // Development / tooling
  'github.com',
  'linear.app',
  'vercel.com',
  'app.doppler.com',
  'sentry.io',
  'grafana.net',
  'neon.tech',
  'app.openrouter.ai',

  // Ops communication (not personal use)
  'app.slack.com',
  'web.telegram.org',

  // Business ops
  'airtable.com',

  // AI providers needed for agent-side auth flows
  'claude.ai',
];

/**
 * Environment variable names that MAY be synced from Pro to Air.
 *
 * Strict allowlist: only Jovie-workflow tokens. No banking tokens, no
 * cloud-root IAM keys, no personal service credentials.
 *
 * Most Jovie secrets already live in Doppler on the Air.
 * agentcookie complements Doppler for short-lived tokens that cannot live
 * in a secrets manager (e.g. session Bearer tokens that rotate on each login).
 */
export const API_KEY_ALLOWLIST: ReadonlyArray<string> = [
  'OPENROUTER_API_KEY',
  'GITHUB_TOKEN',
  'LINEAR_API_KEY',
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_CLIENT_SECRET',
  'SPOTIFY_ACCESS_TOKEN',
  'APPLE_MUSIC_TOKEN',
];

// ─── State paths ──────────────────────────────────────────────────────────────

export const AGENTCOOKIE_STATUS_PATH = join(
  AGENTCOOKIE_STATE_DIR,
  'status.json'
);
export const AGENTCOOKIE_BLOCKLIST_PATH = join(
  AGENTCOOKIE_STATE_DIR,
  'blocklist.txt'
);
export const AGENTCOOKIE_ALLOWLIST_PATH = join(
  AGENTCOOKIE_STATE_DIR,
  'allowlist.txt'
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentcookieStatus = {
  readonly running: boolean;
  readonly lastSyncAt: string | null;
  readonly lastError: string | null;
  readonly cookieCount: number | null;
};

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Write the filter files consumed by the agentcookie CLI. */
export function writeFilterFiles(): void {
  mkdirSync(AGENTCOOKIE_STATE_DIR, { recursive: true });
  mkdirSync(AGENTCOOKIE_COOKIES_DIR, { recursive: true });
  writeFileSync(AGENTCOOKIE_BLOCKLIST_PATH, COOKIE_BLOCKLIST.join('\n') + '\n');
  writeFileSync(AGENTCOOKIE_ALLOWLIST_PATH, COOKIE_ALLOWLIST.join('\n') + '\n');
}

/** Return true if a domain matches any entry in a list (exact or suffix match). */
export function domainMatchesList(
  domain: string,
  list: ReadonlyArray<string>
): boolean {
  const d = domain.toLowerCase().replace(/^\./, '');
  return list.some(entry => {
    const e = entry.toLowerCase();
    return d === e || d.endsWith(`.${e}`);
  });
}

/** Returns true if the domain is allowed to sync (allowlist hit, no blocklist hit). */
export function isDomainAllowed(domain: string): boolean {
  if (domainMatchesList(domain, COOKIE_BLOCKLIST)) return false;
  return domainMatchesList(domain, COOKIE_ALLOWLIST);
}

/** Returns true if the env var name is allowed to sync. */
export function isApiKeyAllowed(envVar: string): boolean {
  return API_KEY_ALLOWLIST.includes(envVar);
}

/** Locate the agentcookie binary; returns null if not installed. */
export function findAgentcookieBin(): string | null {
  const candidates = [
    process.env.AGENTCOOKIE_BIN,
    join(
      process.env.HERMES_HOME ?? `${process.env.HOME}/.hermes`,
      'bin',
      'agentcookie'
    ),
    '/opt/homebrew/bin/agentcookie',
    '/usr/local/bin/agentcookie',
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  try {
    const resolved = execFileSync('which', ['agentcookie'], {
      encoding: 'utf8',
      timeout: 3_000,
    }).trim();
    if (resolved) return resolved;
  } catch {
    // not on PATH
  }
  return null;
}

/** Returns true if the agentcookie receiver process is running. */
export function isReceiverRunning(): boolean {
  try {
    const out = execFileSync('pgrep', ['-f', 'agentcookie.*receive'], {
      encoding: 'utf8',
      timeout: 3_000,
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

/** Returns true if the agentcookie sender process is running. */
export function isSenderRunning(): boolean {
  try {
    const out = execFileSync('pgrep', ['-f', 'agentcookie.*send'], {
      encoding: 'utf8',
      timeout: 3_000,
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

/** Read persisted sync status, or return a zero-state default. */
export function readStatus(): AgentcookieStatus {
  if (!existsSync(AGENTCOOKIE_STATUS_PATH)) {
    return {
      running: false,
      lastSyncAt: null,
      lastError: null,
      cookieCount: null,
    };
  }
  try {
    return JSON.parse(
      readFileSync(AGENTCOOKIE_STATUS_PATH, 'utf8')
    ) as AgentcookieStatus;
  } catch {
    return {
      running: false,
      lastSyncAt: null,
      lastError: null,
      cookieCount: null,
    };
  }
}

/** Persist sync status to disk. */
export function writeStatus(status: AgentcookieStatus): void {
  mkdirSync(AGENTCOOKIE_STATE_DIR, { recursive: true });
  writeFileSync(AGENTCOOKIE_STATUS_PATH, JSON.stringify(status, null, 2));
}

/**
 * Build the argv for `agentcookie receive` (Air side).
 * Returns null if the binary or required env vars are absent.
 *
 * AGENTCOOKIE_ENCRYPT_KEY and AGENTCOOKIE_PORT must be set in Doppler/env.
 */
export function buildReceiveCommand(): string[] | null {
  const bin = findAgentcookieBin();
  if (!bin) return null;
  const key = process.env.AGENTCOOKIE_ENCRYPT_KEY;
  if (!key) return null;
  writeFilterFiles();
  const port = process.env.AGENTCOOKIE_PORT ?? String(AGENTCOOKIE_PORT);
  return [
    bin,
    'receive',
    '--port',
    port,
    '--decrypt-key',
    key,
    '--output-dir',
    AGENTCOOKIE_COOKIES_DIR,
    '--allowlist',
    AGENTCOOKIE_ALLOWLIST_PATH,
    '--blocklist',
    AGENTCOOKIE_BLOCKLIST_PATH,
    '--tailscale-only',
  ];
}

/**
 * Build the argv for `agentcookie send` (Pro side).
 * Returns null if the binary or required env vars are absent.
 *
 * AGENTCOOKIE_AIR_IP, AGENTCOOKIE_ENCRYPT_KEY, and AGENTCOOKIE_PORT must
 * be set in Doppler/env.
 */
export function buildSendCommand(): string[] | null {
  const bin = findAgentcookieBin();
  if (!bin) return null;
  const dest = process.env.AGENTCOOKIE_AIR_IP;
  if (!dest) return null;
  const key = process.env.AGENTCOOKIE_ENCRYPT_KEY;
  if (!key) return null;
  writeFilterFiles();
  const port = process.env.AGENTCOOKIE_PORT ?? String(AGENTCOOKIE_PORT);
  return [
    bin,
    'send',
    '--host',
    dest,
    '--port',
    port,
    '--encrypt-key',
    key,
    '--allowlist',
    AGENTCOOKIE_ALLOWLIST_PATH,
    '--blocklist',
    AGENTCOOKIE_BLOCKLIST_PATH,
    '--continuous',
  ];
}
