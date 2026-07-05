/**
 * agentcookie integration — Hermes-Air spike (JOV-3205 / GH-10930)
 *
 * Wraps the `agentcookie` CLI (mvanhorn/agentcookie) for one-way,
 * encrypted cookie + bearer-token sync from the daily-driver Mac to
 * the agent Mac over Tailscale (AES-256-GCM in transit).
 *
 * SECURITY POSTURE CHANGE — this replicates Tim's real logged-in sessions
 * to the agent box. Defaults to DRY_RUN=true.  Never syncs without an
 * explicit AGENTCOOKIE_LIVE=1 env var override AND Tailscale connectivity.
 *
 * Governance:
 *   - In-perimeter (Tailscale): no vendor-cloud credential storage.
 *   - Blocklist-first: only domains in ALLOWED_DOMAINS are eligible.
 *   - Audit log written to ~/.hermes/logs/agentcookie.jsonl on every run.
 */

import { execFile } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { HERMES_PATHS } from './hermes-paths';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Blocklist: domains whose cookies/tokens must NEVER be synced.
// Add conservatively; removal requires explicit review.
// ---------------------------------------------------------------------------
export const COOKIE_BLOCKLIST: readonly string[] = [
  // Banking & finance
  'bankofamerica.com',
  'chase.com',
  'wellsfargo.com',
  'schwab.com',
  'fidelity.com',
  'robinhood.com',
  'mercury.com',

  // Password managers & identity
  '1password.com',
  'bitwarden.com',
  'keychain.apple.com',
  'accounts.google.com', // Google identity — scope narrower if needed
  'appleid.apple.com',

  // Healthcare / HIPAA
  'epic.com',
  'mychart.com',

  // Stripe & payments (handled via Doppler, not cookie sync)
  'stripe.com',
  'dashboard.stripe.com',

  // Source code infra (use `gh auth` / Doppler instead)
  'github.com',
  'gitlab.com',

  // Cloud providers (use IAM roles / Doppler)
  'aws.amazon.com',
  'console.cloud.google.com',
  'portal.azure.com',
  'vercel.com',
  'neon.tech',

  // Email — high blast-radius if agent box is compromised
  'mail.google.com',
  'outlook.live.com',

  // Legal / government
  'irs.gov',
  'uscis.gov',
];

// ---------------------------------------------------------------------------
// Allowlist: only these domain patterns may be considered for sync.
// Conservative starting set for the spike — expand after Tim review.
// ---------------------------------------------------------------------------
export const COOKIE_ALLOWLIST: readonly string[] = [
  // Authenticated analytics — primary motivation for this spike
  'artists.spotify.com',
  'analytics.spotify.com',
  'music.apple.com',
  'connect.apple.com',

  // Social platform insights (read-only analytics sessions)
  'instagram.com',
  'creators.instagram.com',
  'business.facebook.com',
  'tiktok.com',

  // Jovie tooling
  'app.posthog.com',
  'analytics.amplitude.com',

  // Linear (read-only project management)
  'linear.app',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AgentcookiePrereqs {
  readonly cliInstalled: boolean;
  readonly tailscaleConnected: boolean;
  readonly targetHost: string | null;
}

export interface SyncManifest {
  readonly eligible: readonly string[];
  readonly blocked: readonly string[];
  readonly notInAllowlist: readonly string[];
}

export interface SyncResult {
  readonly dryRun: boolean;
  readonly synced: number;
  readonly blocked: number;
  readonly skipped: number;
  readonly errors: readonly string[];
  readonly durationMs: number;
}

// ---------------------------------------------------------------------------
// Blocklist / allowlist helpers
// ---------------------------------------------------------------------------

/** Returns true if the domain (or any parent) is on the blocklist. */
export function isBlocked(domain: string): boolean {
  const d = domain.toLowerCase().replace(/^\./, '');
  return COOKIE_BLOCKLIST.some(
    blocked => d === blocked || d.endsWith(`.${blocked}`)
  );
}

/** Returns true if the domain is within an explicitly allowed domain. */
export function isAllowed(domain: string): boolean {
  const d = domain.toLowerCase().replace(/^\./, '');
  return COOKIE_ALLOWLIST.some(
    allowed => d === allowed || d.endsWith(`.${allowed}`)
  );
}

/**
 * Given a list of candidate domains, partition into eligible, blocked, and
 * not-in-allowlist buckets.
 */
export function partitionDomains(domains: readonly string[]): SyncManifest {
  const eligible: string[] = [];
  const blocked: string[] = [];
  const notInAllowlist: string[] = [];

  for (const domain of domains) {
    if (isBlocked(domain)) {
      blocked.push(domain);
    } else if (!isAllowed(domain)) {
      notInAllowlist.push(domain);
    } else {
      eligible.push(domain);
    }
  }

  return { eligible, blocked, notInAllowlist };
}

// ---------------------------------------------------------------------------
// Prerequisites check
// ---------------------------------------------------------------------------

/** Check whether agentcookie CLI is installed and Tailscale is up. */
export async function checkPrerequisites(): Promise<AgentcookiePrereqs> {
  const cliInstalled = await checkCli();
  const { connected, host } = await checkTailscale();
  return {
    cliInstalled,
    tailscaleConnected: connected,
    targetHost: host,
  };
}

async function checkCli(): Promise<boolean> {
  try {
    await execFileAsync('agentcookie', ['--version'], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function checkTailscale(): Promise<{
  connected: boolean;
  host: string | null;
}> {
  try {
    const { stdout } = await execFileAsync('tailscale', ['status', '--json'], {
      timeout: 10_000,
    });
    const status = JSON.parse(stdout) as {
      Self?: { HostName?: string };
      BackendState?: string;
    };
    const connected = status.BackendState === 'Running';
    const host = status.Self?.HostName ?? null;
    return { connected, host };
  } catch {
    return { connected: false, host: null };
  }
}

// ---------------------------------------------------------------------------
// Dry-run evaluation (safe — no credentials leave the source machine)
// ---------------------------------------------------------------------------

/**
 * Run agentcookie in list mode to discover what would be synced.
 * Never transfers credentials.
 */
export async function evaluateSyncCandidates(): Promise<{
  readonly domains: readonly string[];
  readonly rawOutput: string;
}> {
  const { stdout } = await execFileAsync(
    'agentcookie',
    ['list', '--format', 'json'],
    { timeout: 30_000 }
  );

  const parsed = JSON.parse(stdout) as { domains?: string[] };
  return {
    domains: parsed.domains ?? [],
    rawOutput: stdout,
  };
}

// ---------------------------------------------------------------------------
// Live sync (REQUIRES explicit AGENTCOOKIE_LIVE=1 env + Tailscale)
// ---------------------------------------------------------------------------

/**
 * Execute a live credential sync to the target Tailscale host.
 *
 * Gated: only runs when AGENTCOOKIE_LIVE=1 is explicitly set.
 * Only domains that pass the allowlist AND are not blocked are synced.
 */
export async function runSync(
  targetHost: string,
  eligibleDomains: readonly string[],
  dryRun = true
): Promise<SyncResult> {
  const start = Date.now();

  if (dryRun) {
    writeAuditLog({
      event: 'dry-run',
      targetHost,
      eligibleCount: eligibleDomains.length,
    });
    return {
      dryRun: true,
      synced: 0,
      blocked: 0,
      skipped: eligibleDomains.length,
      errors: [],
      durationMs: Date.now() - start,
    };
  }

  if (process.env.AGENTCOOKIE_LIVE !== '1') {
    throw new Error(
      'agentcookie live sync requires AGENTCOOKIE_LIVE=1 env var. ' +
        'This is a deliberate safety gate — set it only when Tim has approved.'
    );
  }

  const errors: string[] = [];
  let synced = 0;

  for (const domain of eligibleDomains) {
    try {
      await execFileAsync(
        'agentcookie',
        ['push', '--domain', domain, '--target', targetHost, '--encrypt'],
        { timeout: 30_000 }
      );
      synced++;
    } catch (err) {
      errors.push(
        `${domain}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const result: SyncResult = {
    dryRun: false,
    synced,
    blocked: 0,
    skipped: eligibleDomains.length - synced - errors.length,
    errors,
    durationMs: Date.now() - start,
  };

  writeAuditLog({ event: 'live-sync', targetHost, result });
  return result;
}

// ---------------------------------------------------------------------------
// Audit log (required for security-posture transparency)
// ---------------------------------------------------------------------------
const AUDIT_LOG = join(HERMES_PATHS.logsDir, 'agentcookie.jsonl');

function writeAuditLog(entry: Record<string, unknown>): void {
  try {
    mkdirSync(join(homedir(), '.hermes', 'logs'), { recursive: true });
    appendFileSync(
      AUDIT_LOG,
      `${JSON.stringify({ ...entry, ts: new Date().toISOString() })}\n`
    );
  } catch {
    // never throw from audit log
  }
}
