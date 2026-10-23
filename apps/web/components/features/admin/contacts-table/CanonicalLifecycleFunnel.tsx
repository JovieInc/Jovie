import { ChevronRight } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { buildAdminPeopleHref } from '@/constants/admin-navigation';
import type { CanonicalContactMetrics } from '@/lib/admin/contacts';
import {
  CONTACT_LIFECYCLE_STAGES,
  getContactLifecycleStageLabel,
} from '@/lib/contacts/lifecycle';

/**
 * Window and population for every lifecycle count. These are deduped contacts
 * (leads, waitlist, profiles, users) counted once at their current stage, so
 * they intentionally differ from windowed funnel counts and People tab totals.
 */
export const CANONICAL_LIFECYCLE_SCOPE =
  'All time · deduped contacts, each counted once at current stage (not cumulative)';

interface CanonicalLifecycleFunnelProps {
  readonly metrics: CanonicalContactMetrics;
}

/**
 * Growth funnel derived from the canonical contacts lifecycle (JOV-6888) —
 * the same deduped stages the Customers table filters on.
 */
export function CanonicalLifecycleFunnel({
  metrics,
}: Readonly<CanonicalLifecycleFunnelProps>) {
  return (
    <ContentSurfaceCard data-testid='canonical-lifecycle-funnel'>
      <div className='mb-3 flex items-baseline justify-between gap-3'>
        <div>
          <h2 className='text-balance text-sm font-semibold tracking-tight text-primary-token'>
            Customer Lifecycle
          </h2>
          <p
            className='mt-0.5 text-2xs text-tertiary-token'
            data-testid='canonical-lifecycle-scope'
          >
            {CANONICAL_LIFECYCLE_SCOPE}
          </p>
        </div>
        <a
          href={buildAdminPeopleHref('contacts')}
          className='text-xs text-secondary-token underline-offset-2 hover:text-primary-token hover:underline'
        >
          View all {metrics.total.toLocaleString()}
        </a>
      </div>
      <div className='flex flex-wrap items-center gap-1.5'>
        {CONTACT_LIFECYCLE_STAGES.map((stage, index) => (
          <div key={stage} className='flex items-center gap-1.5'>
            <a
              href={buildAdminPeopleHref(
                'contacts',
                new URLSearchParams({ stage })
              )}
              className='flex flex-col rounded-md px-1 py-0.5 hover:bg-surface-1'
            >
              <span className='text-app font-book text-secondary-token'>
                {getContactLifecycleStageLabel(stage)}
              </span>
              <span className='text-xl font-medium tabular-nums text-primary-token'>
                {metrics[stage].toLocaleString()}
              </span>
            </a>
            {index < CONTACT_LIFECYCLE_STAGES.length - 1 && (
              <ChevronRight className='mx-1 h-4 w-4 shrink-0 text-tertiary-token' />
            )}
          </div>
        ))}
      </div>
    </ContentSurfaceCard>
  );
}
