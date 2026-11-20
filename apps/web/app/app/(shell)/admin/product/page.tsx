import type { Metadata } from 'next';
import Link from 'next/link';
import { CapabilityEvidenceMatrix } from '@/components/features/admin/CapabilityEvidenceMatrix';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { StatusPipeline } from '@/components/molecules/StatusPipeline';
import { APP_ROUTES } from '@/constants/routes';
import { loadCapabilityEvidence } from '@/lib/admin/capability-evidence';
import { capabilityLifecycleStages } from '@/lib/admin/capability-evidence-model';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';

export const metadata: Metadata = { title: 'Product | Ovie' };
export const runtime = 'nodejs';

const evidenceGaps = [
  'Web and client version distribution is not observed by an authoritative source; running-client evidence stays unknown.',
  'Only public profile pages join configured state to observed exposure and outcome; other capabilities still show configured state only.',
] as const;

const LINK_CLASS = 'text-secondary-token hover:text-primary-token';

export default async function ProductPage() {
  await requireCurrentAdminPageAccess();
  const capabilityEvidence = await loadCapabilityEvidence();

  return (
    <AdminPage
      views='shipping'
      title='Product'
      description='What customers are actually experiencing, from intent through healthy production observation.'
      testId='founder-product-page'
    >
      <ContentSurfaceCard surface='details' as='section'>
        <ContentSectionHeader
          title='Lifecycle'
          subtitle={capabilityEvidence.title}
          density='compact'
        />
        <div className='p-3'>
          <StatusPipeline
            ariaLabel='Product Delivery Lifecycle'
            stages={capabilityLifecycleStages(capabilityEvidence)}
          />
        </div>
      </ContentSurfaceCard>

      <CapabilityEvidenceMatrix record={capabilityEvidence} />

      <ContentSurfaceCard surface='details' as='section'>
        <ContentSectionHeader
          title='Evidence Gaps'
          subtitle='Unknown is not treated as shipped. These observations need instrumentation.'
          density='compact'
        />
        <div className='space-y-3 p-3'>
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
            <Link className={LINK_CLASS} href={APP_ROUTES.ADMIN_FEATURES}>
              Inspect feature state →
            </Link>
            <Link className={LINK_CLASS} href={APP_ROUTES.ADMIN_RELEASES}>
              Inspect release entities →
            </Link>
          </div>
        </div>
      </ContentSurfaceCard>
    </AdminPage>
  );
}
