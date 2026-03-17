import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { CardSkeleton } from '@/components/molecules/LoadingSkeleton';
import { PageContent, PageShell } from '@/components/organisms/PageShell';

const CAMPAIGN_SKELETON_KEYS = ['campaign-1', 'campaign-2', 'campaign-3'];

/**
 * Loading skeleton for the admin campaigns page.
 */
export default function CampaignsLoading() {
  return (
    <PageShell>
      <PageContent>
        <div className='space-y-6' aria-busy='true'>
          <ContentSectionHeaderSkeleton
            titleWidth='w-40'
            descriptionWidth='w-48'
            actionWidths={['w-36']}
            className='rounded-xl border border-subtle bg-(--linear-app-content-surface) px-6'
          />

          <div className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
            {CAMPAIGN_SKELETON_KEYS.map(key => (
              <CardSkeleton key={key} />
            ))}
          </div>
        </div>
      </PageContent>
    </PageShell>
  );
}
