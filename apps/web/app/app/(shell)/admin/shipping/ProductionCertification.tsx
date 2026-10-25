import 'server-only';

import {
  type ProdDogfoodMission,
  readProdDogfoodLedger,
} from '@/lib/ovie/certifications/prod-dogfood-ledger';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';

const STATUS_LABEL: Record<ProdDogfoodMission['status'], string> = {
  certified: 'Certified',
  failing: 'Failing',
  'uncertified:blocked': 'Uncertified: blocked',
  'uncertified:stale-sha': 'Uncertified: stale build',
};

export function productionCertificationRows(
  missions: readonly ProdDogfoodMission[]
): readonly ProdDogfoodMission[] {
  const rank: Record<ProdDogfoodMission['status'], number> = {
    failing: 0,
    'uncertified:stale-sha': 1,
    'uncertified:blocked': 2,
    certified: 3,
  };
  return [...missions].sort(
    (a, b) =>
      rank[a.status] - rank[b.status] || a.missionId.localeCompare(b.missionId)
  );
}

/**
 * Production certification: which journeys a dogfood agent has verified on the
 * live build, and which are not certified yet (with the blocker). Reads the
 * ledger the production dogfood agent writes; never reports a missing ledger
 * as zero.
 */
export async function ProductionCertification() {
  let ledger: Awaited<ReturnType<typeof readProdDogfoodLedger>> = null;
  let unavailable = false;
  try {
    ledger = await readProdDogfoodLedger(postgresRecordBackend());
  } catch {
    unavailable = true;
  }
  const latest = ledger?.latest ?? null;
  return (
    <section
      aria-labelledby='production-certification-title'
      data-testid='production-certification'
      className='space-y-3 p-4'
    >
      <h2
        id='production-certification-title'
        className='text-sm font-semibold text-primary-token'
      >
        Production Certification
      </h2>
      {latest ? (
        <>
          <p className='text-xs text-secondary-token'>
            {latest.missions.filter(m => m.status === 'certified').length} of{' '}
            {latest.missions.length} journeys certified on build{' '}
            {latest.servedSha.slice(0, 10)}, checked {latest.generatedAt}.
          </p>
          <ul className='divide-y divide-subtle'>
            {productionCertificationRows(latest.missions).map(m => (
              <li key={m.missionId} className='space-y-0.5 py-2'>
                <div className='flex items-baseline justify-between gap-3'>
                  <span className='text-sm text-primary-token'>{m.title}</span>
                  <span className='shrink-0 text-xs text-secondary-token'>
                    {STATUS_LABEL[m.status]}
                  </span>
                </div>
                {m.status !== 'certified' && m.blocker ? (
                  <p className='text-xs text-tertiary-token'>
                    {m.blocker}
                    {m.owner ? ` Owner: ${m.owner}.` : ''}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className='text-xs text-secondary-token'>
          {unavailable
            ? 'Certification ledger is unavailable.'
            : 'No dogfood run has reported yet. Nothing is certified.'}
        </p>
      )}
    </section>
  );
}
