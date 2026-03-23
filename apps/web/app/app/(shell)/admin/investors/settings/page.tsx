import { Button } from '@jovie/ui';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { APP_ROUTES } from '@/constants/routes';

export const metadata: Metadata = {
  title: 'Investor Portal Settings',
};

/**
 * Admin investor portal settings page.
 * Toggle progress bar, set raise target, configure URLs, etc.
 */
export default function InvestorSettingsPage() {
  return (
    <PageShell>
      <PageContent>
        <h1 className='sr-only'>Investor portal settings</h1>
        <ContentSurfaceCard className='overflow-hidden p-0'>
          <ContentSectionHeader
            title='Investor portal settings'
            subtitle='Keep fundraising controls aligned with the rest of the product-side settings language before interactive fields land.'
            actions={
              <Button variant='secondary' size='sm' asChild>
                <Link href={APP_ROUTES.ADMIN_INVESTORS}>
                  <ArrowLeft className='mr-1.5 h-3.5 w-3.5' />
                  View pipeline
                </Link>
              </Button>
            }
          />
          <div className='grid gap-3 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y) lg:grid-cols-2'>
            <ContentSurfaceCard surface='nested' className='space-y-3 p-4'>
              <p className='text-[11px] uppercase tracking-[0.08em] text-tertiary-token'>
                Settings cadence
              </p>
              <div className='space-y-2 text-[13px] leading-[19px] text-secondary-token'>
                <p>
                  Use compact label, helper copy, and control rows like the rest
                  of the settings surfaces.
                </p>
                <p>
                  Expected controls here include raise target, CTA destinations,
                  portal behavior flags, and memo visibility defaults.
                </p>
              </div>
            </ContentSurfaceCard>
            <ContentSurfaceCard surface='nested' className='space-y-3 p-4'>
              <div className='flex h-10 w-10 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token'>
                <SlidersHorizontal className='h-4 w-4' aria-hidden='true' />
              </div>
              <div className='space-y-1'>
                <p className='text-[14px] font-[560] tracking-[-0.016em] text-primary-token'>
                  Structure is in place
                </p>
                <p className='text-[12px] leading-[18px] text-secondary-token'>
                  The remaining work is wiring actual form controls and
                  persistence into this now-standardized settings shell.
                </p>
              </div>
            </ContentSurfaceCard>
          </div>
        </ContentSurfaceCard>
      </PageContent>
    </PageShell>
  );
}
