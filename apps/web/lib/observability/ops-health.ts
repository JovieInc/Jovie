import 'server-only';

import { getDeployedBuildInfo } from './build-info';

/**
 * ops.health/v1 envelope for this deployment (canon/OPS_HEALTH.md). The
 * validator lives in scripts/lib/ops-health.mjs; ops-health.test.ts asserts
 * this builder passes it. Unknown stays explicit: commitSha and deployedAt are
 * null, never faked.
 */
export type OpsStatus = 'up' | 'degraded' | 'down' | 'unknown';

export interface OpsDependency {
  readonly name: string;
  readonly status: OpsStatus;
  readonly observedAt: string | null;
  readonly latencyMs: number | null;
  readonly detail?: string;
}

export interface OpsHealthEnvelope {
  readonly schema: 'ops.health/v1';
  readonly service: string;
  readonly environment: string;
  readonly commitSha: string | null;
  readonly deployedAt: string | null;
  readonly version: string | null;
  readonly status: OpsStatus;
  readonly checkedAt: string;
  readonly dependencies: readonly OpsDependency[];
  readonly links?: Record<string, string>;
}

export function resolveServiceName(): string {
  return process.env.OPS_SERVICE?.trim() || 'jovie-web';
}

/**
 * Identity + liveness. `up` here means this process answered and knows who it
 * is; dependency health is the authorized /api/health/comprehensive detail and
 * is linked, not duplicated, so an anonymous caller never learns vendor state.
 */
export async function getOpsHealthEnvelope(
  now: number = Date.now()
): Promise<OpsHealthEnvelope> {
  const build = await getDeployedBuildInfo();
  const known = build.commitSha !== undefined;
  return {
    schema: 'ops.health/v1',
    service: resolveServiceName(),
    environment: build.environment ?? 'unknown',
    commitSha: build.commitSha ?? null,
    deployedAt: build.deployedAt,
    version: build.version || null,
    // Without a known commit we cannot claim to be a healthy, identified build.
    status: known ? 'up' : 'unknown',
    checkedAt: new Date(now).toISOString(),
    dependencies: [],
    links: { detail: '/api/health/comprehensive', liveness: '/api/health' },
  };
}
