import { Button } from '@jovie/ui';
import { ArrowLeft, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { APP_ROUTES } from '@/constants/routes';

export const metadata: Metadata = {
  title: 'Investor Links',
};

/**
 * Admin investor links management page.
 * Create new links, copy URLs, toggle active/inactive.
 * Client component for interactivity (create modal, copy to clipboard).
 */
export default function InvestorLinksPage() {
  return (
    <PageShell>
      <PageContent>
        <ContentSurfaceCard className='overflow-hidden p-0'>
          <ContentSectionHeader
            title='Manage investor links'
            subtitle='Create shareable entry points into the investor portal, then wire actions and permissions on top of them.'
            actions={
              <Button size='sm' asChild>
                <Link href={APP_ROUTES.ADMIN_INVESTORS}>
                  <ArrowLeft className='mr-1.5 h-3.5 w-3.5' />
                  Back to pipeline
                </Link>
              </Button>
            }
          />
          <div className='grid gap-3 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y) lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]'>
            <ContentSurfaceCard surface='nested' className='space-y-3 p-4'>
              <div>
                <p className='text-[11px] uppercase tracking-[0.08em] text-tertiary-token'>
                  Planned controls
                </p>
                <p className='mt-1 text-[14px] font-[560] tracking-[-0.016em] text-primary-token'>
                  Create, copy, deactivate, and audit link usage
                </p>
              </div>
              <div className='space-y-2 text-[13px] leading-[19px] text-secondary-token'>
                <p>
                  Each investor link should expose token status, owner label,
                  destination state, and last-use history.
                </p>
                <p>
                  The route now uses the same card, spacing, and header system
                  as the rest of the admin shell, so the real client-side
                  manager can drop in without another visual reset.
                </p>
              </div>
            </ContentSurfaceCard>
            <ContentSurfaceCard surface='nested' className='space-y-3 p-4'>
              <div className='flex h-10 w-10 items-center justify-center rounded-full border border-(--linear-app-frame-seam) bg-surface-0 text-secondary-token'>
                <Sparkles className='h-4 w-4' aria-hidden='true' />
              </div>
              <div className='space-y-1'>
                <p className='text-[14px] font-[560] tracking-[-0.016em] text-primary-token'>
                  Ready for the interactive manager
                </p>
                <p className='text-[12px] leading-[18px] text-secondary-token'>
                  The missing work here is behavior, not visual structure. Once
                  the create modal and table actions land, they should reuse
                  this shell instead of replacing it.
                </p>
              </div>
            </ContentSurfaceCard>
          </div>
        </ContentSurfaceCard>
      </PageContent>
    </PageShell>
  );
}
