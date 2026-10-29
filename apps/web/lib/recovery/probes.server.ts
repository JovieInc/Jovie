import 'server-only';

import { env } from '@/lib/env';
import { resolveCommitSha } from '@/lib/observability/build-info';
import {
  PROD_GOLDEN_PATH_SURFACE_IDS,
  readProdGoldenPathLedger,
} from '@/lib/ovie/certifications/prod-golden-path-ledger';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import type { FixCertifier } from './gate';
import { KNOWN_BAD_FLOW_FIXES } from './registry';

const DEPLOYED_PREFIX = 'recovery:fix-deployed:';

/**
 * Production certifier. Conservative by construction: every probe answers no
 * unless it positively proves the fix is served by production right now.
 *
 * - Live: this process is the production deployment, its build contains the
 *   fix (the fix PR flips `shippedInCode`, so only builds with the fix see it),
 *   and the public build-info receipt reports this same commit.
 * - Deployed-at: the first time that holds, recorded once. It is never earlier
 *   than the real deploy, so a user is never judged to have stalled before a
 *   fix that was not yet live.
 * - Recheck: the latest production golden-path receipt for the step's surface
 *   passed on exactly this commit.
 */
export function createProductionCertifier(
  fetchImpl: typeof fetch = fetch
): FixCertifier {
  const backend = postgresRecordBackend();
  const ownSha = resolveCommitSha();
  return {
    async isLiveOnProduction() {
      if (!ownSha || env.VERCEL_ENV !== 'production') return false;
      try {
        const res = await fetchImpl(
          `${env.NEXT_PUBLIC_APP_URL ?? 'https://jov.ie'}/api/health/build-info`,
          { cache: 'no-store', signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) return false;
        const body = (await res.json()) as { commitSha?: string };
        return body.commitSha === ownSha;
      } catch {
        return false;
      }
    },
    async deployedAt(fix) {
      const key = `${DEPLOYED_PREFIX}${fix.id}`;
      const now = new Date().toISOString();
      if (await backend.setIfAbsent(key, now, 10 * 365 * 24 * 3600)) return now;
      const stored = await backend.get(key);
      return typeof stored === 'string' ? stored : null;
    },
    async recheck(checkId) {
      if (!ownSha) return false;
      if (!(PROD_GOLDEN_PATH_SURFACE_IDS as string[]).includes(checkId)) {
        return false;
      }
      const ledger = await readProdGoldenPathLedger(backend);
      const latest = ledger?.surfaces[checkId]?.latest;
      return latest?.status === 'passed' && latest.sha === ownSha;
    },
  };
}

/**
 * Records the deploy time of every fix this build ships. Called when
 * production serves its identity receipt, which the Production Controller
 * reads right after each promote, so the time is set by the release event and
 * never by hand. Idempotent and silent outside production.
 */
export async function recordShippedFixDeploys(): Promise<void> {
  if (env.VERCEL_ENV !== 'production') return;
  const certifier = createProductionCertifier();
  for (const fix of KNOWN_BAD_FLOW_FIXES) {
    if (fix.shippedInCode) await certifier.deployedAt(fix);
  }
}
