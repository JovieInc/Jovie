import 'server-only';

import { BASE_URL } from '@/constants/domains';
import { env } from '@/lib/env';
import { resolveCommitSha } from '@/lib/observability/build-info';
import { readProdGoldenPathLedger } from '@/lib/ovie/certifications/prod-golden-path-ledger';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import { type FixCertifier, isGoldenPathGreen } from './gate';
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
 * - Whole path: all 8 golden-path surfaces passed on this commit within 24
 *   hours, decided by the shared `certificationVerdict` (see gate.ts). A fixed
 *   step is not enough if the user would fail at signup or claim afterwards.
 * - Recheck: the fix's own step check (registry `checkId`) passed on exactly
 *   this commit in the latest production golden-path receipts.
 */
export function createProductionCertifier(
  fetchImpl: typeof fetch = fetch
): FixCertifier {
  const backend = postgresRecordBackend();
  const ownSha = resolveCommitSha();
  // An unreadable or malformed ledger is evidence that cannot be trusted: no.
  const readLedger = () => readProdGoldenPathLedger(backend).catch(() => null);
  return {
    async isLiveOnProduction() {
      if (!ownSha || env.VERCEL_ENV !== 'production') return false;
      try {
        const res = await fetchImpl(`${BASE_URL}/api/health/build-info`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        });
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
    async goldenPathGreen() {
      const ledger = await readLedger();
      return isGoldenPathGreen(ledger, ownSha ?? null, new Date());
    },
    async recheck(checkId) {
      if (!ownSha) return false;
      const ledger = await readLedger();
      if (!ledger) return false;
      // The fix's own step check is one check inside a surface receipt (for
      // example claim/golden-path-preview-has-release). It must have passed on
      // exactly this commit.
      const results = Object.values(ledger.surfaces)
        .filter(record => record.latest.sha === ownSha)
        .flatMap(record => record.latest.checks)
        .filter(check => check.id === checkId);
      return results.length > 0 && results.every(c => c.status === 'passed');
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
