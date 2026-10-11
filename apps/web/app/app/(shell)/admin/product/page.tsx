import type { Metadata } from 'next';
import { CapabilityEvidenceMatrix } from '@/components/features/admin/CapabilityEvidenceMatrix';
import { OvieShippingStateCard } from '@/components/features/admin/hud/OvieShippingStateCard';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { loadCapabilityEvidence } from '@/lib/admin/capability-evidence';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export const metadata: Metadata = { title: 'Product | Ovie' };
export const runtime = 'nodejs';

const lifecycle = [
  'Desired',
  'Built',
  'Certified',
  'Deployed',
  'Exposed',
  'Observed',
  'Healthy',
] as const;

const evidenceGaps = [
  'Web and client version distribution is not observed by an authoritative source; running-client evidence stays unknown.',
  'Only public profile pages join configured state to observed exposure and outcome; other capabilities still show configured state only.',
] as const;

export default async function ProductPage() {
  await requireCurrentAdminPageAccess();
  const capabilityEvidence = await loadCapabilityEvidence();

  return (
    <AdminPage
      title='Product'
      description='What customers are actually experiencing, from intent through healthy production observation.'
      testId='founder-product-page'
    >
      <ol
        className='flex min-h-11 items-center gap-1 overflow-x-auto text-2xs text-secondary-token'
        aria-label='Product Delivery Lifecycle'
      >
        {lifecycle.map((stage, index) => (
          <li key={stage} className='flex shrink-0 items-center gap-1'>
            <span className='rounded-(--radius-sm) border border-subtle px-2 py-1'>
              {stage}
            </span>
            {index < lifecycle.length - 1 ? (
              <span aria-hidden='true'>→</span>
            ) : null}
          </li>
        ))}
      </ol>

      <OvieShippingStateCard />

      <CapabilityEvidenceMatrix record={capabilityEvidence} />

      <ContentSurfaceCard surface='details'>
        <div className='space-y-3 p-3'>
          <div>
            <h2 className='line-clamp-2 text-app font-semibold text-primary-token'>
              Evidence Gaps
            </h2>
            <p className='text-2xs text-tertiary-token'>
              Unknown is not treated as shipped. These observations need
              instrumentation.
            </p>
          </div>
          <ul className='space-y-2 text-app text-secondary-token'>
            {evidenceGaps.map(gap => (
              <li
                key={gap}
                className='border-t border-subtle pt-2 first:border-0 first:pt-0'
              >
                {gap}
              </li>
            ))}
          </ul>
          <div className='flex flex-wrap gap-3 text-2xs font-medium'>
            <a
              className='text-secondary-token hover:text-primary-token'
              href={APP_ROUTES.ADMIN_FEATURES}
            >
              Inspect feature state →
            </a>
            <a
              className='text-secondary-token hover:text-primary-token'
              href={APP_ROUTES.ADMIN_RELEASES}
            >
              Inspect release entities →
            </a>
          </div>
        </div>
      </ContentSurfaceCard>
    </AdminPage>
  );
}
