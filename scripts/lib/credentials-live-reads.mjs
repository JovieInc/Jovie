/**
 * Bounded live reads for the credentials and spend registry. Every reader
 * returns metadata only (balances, counters, expiry timestamps, names). No
 * reader returns, logs or persists a secret value; grant declarations are
 * parsed in memory and only their dated fields leave this module.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const GATEWAY_CREDITS_URL = 'https://ai-gateway.vercel.sh/v1/credits';
export const SUMMER_VERCEL_PROJECT = 'jovie-eve-shadow';
export const VERCEL_TEAM_ID = 'team_bpNDbti6srVLYPKdmQLu4UgT';
export const CODEX_ACCOUNTS_PATH = join(
  homedir(),
  '.local/state/jovie-lanes/codex-accounts.json'
);
const TIMEOUT_MS = 15_000;

/** AI Gateway credit balance. Accepts a Gateway API key or a Vercel OIDC token. */
export async function readGatewayCredits({ token, fetchImpl = fetch, now }) {
  if (!token) return { ok: false, reason: 'no-gateway-token' };
  const response = await fetchImpl(GATEWAY_CREDITS_URL, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok)
    return { ok: false, reason: `gateway-credits-http-${response.status}` };
  const body = await response.json();
  const balanceUsd = Number(body?.balance);
  const totalUsedUsd = Number(body?.total_used);
  if (!Number.isFinite(balanceUsd) || !Number.isFinite(totalUsedUsd))
    return { ok: false, reason: 'gateway-credits-unparsed' };
  return {
    ok: true,
    value: {
      observedAt: new Date(now()).toISOString(),
      balanceUsd,
      totalUsedUsd,
      source: 'ai-gateway /v1/credits',
    },
  };
}

/** Vercel CLI login on this machine, when present. Never printed. */
export function localVercelToken() {
  for (const path of [
    join(homedir(), 'Library/Application Support/com.vercel.cli/auth.json'),
    join(homedir(), '.local/share/com.vercel.cli/auth.json'),
  ]) {
    try {
      if (existsSync(path)) {
        const token = JSON.parse(readFileSync(path, 'utf8'))?.token;
        if (token) return token;
      }
    } catch {
      // unreadable auth file: treat as absent
    }
  }
  return null;
}

/**
 * Summer's dated provider declarations (`*_GRANT`) on its Vercel project.
 * Only plain-type variables carry readable declarations; sensitive values are
 * never requested. Each grant becomes a registry credential overlay keyed by
 * `summer-grant:<ENV NAME>` with its expiry and whether its flag is on.
 */
export async function readSummerGrants({
  token,
  fetchImpl = fetch,
  project = SUMMER_VERCEL_PROJECT,
  teamId = VERCEL_TEAM_ID,
}) {
  if (!token) return { ok: false, reason: 'no-vercel-token' };
  const url = new URL(`https://api.vercel.com/v10/projects/${project}/env`);
  url.searchParams.set('teamId', teamId);
  const response = await fetchImpl(url, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok)
    return { ok: false, reason: `vercel-env-http-${response.status}` };
  const envs = (await response.json())?.envs ?? [];
  return { ok: true, value: summarizeGrants(envs) };
}

export function summarizeGrants(envs) {
  const production = envs.filter(env =>
    (env.target ?? []).includes('production')
  );
  const flags = new Map(
    production
      .filter(env => env.type === 'plain' && /_ENABLED$/.test(env.key))
      .map(env => [env.key, env.value])
  );
  const grants = [];
  for (const env of production) {
    if (env.type !== 'plain' || !/_GRANT$/.test(env.key)) continue;
    let declaration = null;
    try {
      declaration = JSON.parse(env.value ?? 'null');
    } catch {
      declaration = null;
    }
    const flag = env.key.replace(/_GRANT$/, '_ENABLED');
    grants.push({
      id: `summer-grant:${env.key}`,
      envName: env.key,
      schema: declaration?.schema ?? null,
      verifiedAt: declaration?.verifiedAt ?? null,
      expiresAt: declaration?.expiresAt ?? null,
      enabledFlag: flag,
      enabled: flags.get(flag) === 'true',
    });
  }
  return grants;
}

/**
 * Overlay entries for evaluateRegistry({ live: { credentials } }). A grant a
 * specific registry entry already claims updates that entry's expiry and keeps
 * its recorded status (e.g. superseded); an unclaimed grant joins as a new
 * active-or-unused credential, so a new time-boxed grant is watched from the
 * first run after it is declared.
 */
export function grantOverlays(grants, registryCredentials = []) {
  const claimed = registryCredentials.filter(
    entry => entry.kind === 'grant' && !entry.catchAll
  );
  return grants.map(grant => {
    const owner = claimed.find(entry =>
      (entry.names ?? []).some(pattern =>
        new RegExp(`^(?:${pattern})$`).test(grant.envName)
      )
    );
    if (owner)
      return {
        id: owner.id,
        expiresAt: grant.expiresAt ?? owner.expiresAt,
        liveEnabled: grant.enabled,
      };
    return newGrantOverlay(grant);
  });
}

function newGrantOverlay(grant) {
  return {
    id: grant.id,
    provider: 'summer-config',
    kind: 'grant',
    label: `Summer ${grant.envName}`,
    owner: 'summer-config',
    consumers: ['summer'],
    stores: ['vercel:jovie-eve-shadow'],
    names: [grant.envName],
    expiresAt: grant.expiresAt,
    expiryBasis: 'provider-field',
    status: grant.enabled ? 'active' : 'unused',
    liveEnabled: grant.enabled,
  };
}

/**
 * Gem's Codex capacity ledger. Banked reset credits carry a redemption
 * deadline; accounts whose last run failed auth are reported by name.
 */
export function readCodexAccounts(path = CODEX_ACCOUNTS_PATH) {
  if (!existsSync(path)) return { ok: false, reason: 'no-codex-ledger' };
  const ledger = JSON.parse(readFileSync(path, 'utf8'));
  return { ok: true, value: summarizeCodexAccounts(ledger) };
}

const isoSeconds = value =>
  typeof value === 'number' ? new Date(value * 1000).toISOString() : null;

export function summarizeCodexAccounts(ledger) {
  const accounts = [];
  for (const [name, entry] of Object.entries(ledger ?? {})) {
    if (name.startsWith('_') || !entry || typeof entry !== 'object') continue;
    const lease = entry.capacityLease ?? {};
    const primary = lease.usableCapacityRemaining?.primary ?? {};
    accounts.push({
      account: name,
      plan: lease.planType ?? null,
      observedAt: lease.generatedAt ?? null,
      remainingPercent: primary.remainingPercent ?? null,
      windowResetsAt: isoSeconds(primary.resetsAt),
      lastKind: entry.lastKind ?? null,
      bankedResets: (lease.credits?.details ?? [])
        .filter(credit => credit.status === 'available')
        .map(credit => ({ deadline: isoSeconds(credit.redemptionDeadline) })),
    });
  }
  return accounts;
}

export function codexOverlays(accounts) {
  const overlays = [];
  for (const account of accounts) {
    account.bankedResets.forEach((credit, index) => {
      overlays.push({
        id: `codex:${account.account}:banked-reset:${index + 1}`,
        provider: 'openai-codex',
        kind: 'credit',
        label: `Codex ${account.account} banked rate-limit reset`,
        owner: 'gem-lanes',
        consumers: ['symphony-codex-lanes'],
        expiresAt: credit.deadline,
        expiryBasis: 'provider-field',
        status: 'active',
      });
    });
  }
  return overlays;
}
