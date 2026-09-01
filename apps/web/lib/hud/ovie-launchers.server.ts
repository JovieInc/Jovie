import 'server-only';

import { spawn } from 'node:child_process';
import { publicEnv } from '@/lib/env-public';
import { env } from '@/lib/env-server';
import { serverFetch } from '@/lib/http/server-fetch';
import { fetchTimActionIssues } from '@/lib/hud/linear-actions';
import {
  isSafeSshHost,
  OVIE_LAUNCHER_CATALOG,
  type OvieLauncherInventory,
  type OvieLauncherResolvedDestination,
  type OvieLauncherStatus,
  originFromUrl,
  publicHref,
  rankLaunchers,
  resolveLauncherDestination,
  SYMPHONY_SSH_TEMPLATE_HOST,
} from '@/lib/hud/ovie-launchers';
import { logger } from '@/lib/utils/logger';

const PREFLIGHT_TIMEOUT_MS = 2000;
const SSH_PREFLIGHT_TIMEOUT_MS = 2500;

// biome-ignore format: compact config
export interface OvieLauncherConfig {
  readonly gbrainApiUrl?: string; readonly githubOwner?: string;
  readonly githubRepo?: string; readonly productionOrigin?: string;
}

export function readOvieLauncherConfig(): OvieLauncherConfig {
  return {
    gbrainApiUrl: env.GBRAIN_API_URL,
    githubOwner: env.HUD_GITHUB_OWNER,
    githubRepo: env.HUD_GITHUB_REPO,
    productionOrigin: publicEnv.NEXT_PUBLIC_APP_URL,
  };
}

export function resolveOvieLauncherDestinations(
  config: OvieLauncherConfig = readOvieLauncherConfig()
): Record<string, OvieLauncherResolvedDestination> {
  return Object.fromEntries(
    OVIE_LAUNCHER_CATALOG.map(definition => [
      definition.id,
      resolveLauncherDestination(definition, config),
    ])
  );
}

export async function preflightWebDestination(
  href: string
): Promise<{ status: OvieLauncherStatus; detail: string }> {
  const target = publicHref(href);
  if (!target) return { status: 'not_configured', detail: 'No public href' };
  try {
    const response = await serverFetch(target, {
      method: 'GET',
      redirect: 'manual',
      timeoutMs: PREFLIGHT_TIMEOUT_MS,
      context: 'ovie-launcher-preflight',
      retry: { maxRetries: 0, baseDelayMs: 0 },
      headers: { Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
    });
    void response.body?.cancel().catch(() => {});
    const ready = response.status >= 200 && response.status < 500;
    return {
      status: ready ? 'ready' : 'unavailable',
      detail: `HTTP ${response.status}`,
    };
  } catch {
    return { status: 'unavailable', detail: 'Destination unreachable' };
  }
}

export function preflightSshDestination(
  host: string,
  spawnSsh: typeof spawn = spawn
): Promise<{ status: OvieLauncherStatus; detail: string }> {
  if (!isSafeSshHost(host)) {
    return Promise.resolve({
      status: 'not_configured',
      detail: 'SSH host is not a safe alias',
    });
  }
  return new Promise(resolve => {
    const child = spawnSsh(
      'ssh',
      // biome-ignore format: keep argv compact
      ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=2', '-o', 'StrictHostKeyChecking=yes', host, 'true'],
      { stdio: 'ignore' }
    );
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ status: 'unavailable', detail: 'SSH preflight timed out' });
    }, SSH_PREFLIGHT_TIMEOUT_MS);
    child.once('error', () => {
      clearTimeout(timer);
      resolve({ status: 'unavailable', detail: 'SSH client unavailable' });
    });
    child.once('exit', code => {
      clearTimeout(timer);
      resolve(
        code === 0
          ? { status: 'ready', detail: 'SSH reachable' }
          : { status: 'unavailable', detail: 'SSH destination unreachable' }
      );
    });
  });
}

export async function preflightLauncherDestinations(
  destinations: Readonly<Record<string, OvieLauncherResolvedDestination>>
): Promise<Record<string, OvieLauncherStatus>> {
  const entries = await Promise.all(
    OVIE_LAUNCHER_CATALOG.map(async definition => {
      const destination = destinations[definition.id];
      if (definition.agentCliOnly || !destination) {
        return [definition.id, 'not_configured' as const] as const;
      }
      if (
        definition.id === 'symphony' &&
        destination.sshHost === SYMPHONY_SSH_TEMPLATE_HOST
      ) {
        // The hosted HUD cannot attest the Mac's SSH agent. The renderer gates
        // this control to Electron and the main process owns the fixed launch.
        return [definition.id, 'ready' as const] as const;
      }
      if (destination.sshHost) {
        const result = await preflightSshDestination(destination.sshHost);
        return [definition.id, result.status] as const;
      }
      const href = destination.href ? originFromUrl(destination.href) : null;
      if (!href) {
        return [definition.id, 'not_configured' as const] as const;
      }
      const result = await preflightWebDestination(href);
      return [definition.id, result.status] as const;
    })
  );
  return Object.fromEntries(entries);
}

export async function loadOvieLauncherInventory(): Promise<OvieLauncherInventory> {
  const destinations = resolveOvieLauncherDestinations();
  const [availability, timActions] = await Promise.all([
    preflightLauncherDestinations(destinations),
    fetchTimActionIssues().catch(error => {
      logger.warn('[ovie-launchers] tim-action count unavailable', error);
      return { issues: [], observation: 'unavailable' as const };
    }),
  ]);
  const timActionCount =
    timActions.observation === 'ok' || timActions.observation === 'empty'
      ? timActions.issues.length
      : 0;
  return rankLaunchers({
    destinations,
    state: { timActionCount, availability },
    generatedAtIso: new Date().toISOString(),
  });
}
