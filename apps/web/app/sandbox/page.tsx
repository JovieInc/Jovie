import { Button, Input } from '@jovie/ui';
import type { Metadata } from 'next';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

export default function SandboxPage() {
  return (
    <StandaloneProductPage width='md'>
      <div className='space-y-6'>
        <ContentSurfaceCard surface='details'>
          <ContentSectionHeader
            density='compact'
            title='UI sandbox'
            subtitle='Preview core interface elements without signing in.'
          />

          <div className='grid grid-cols-1 gap-3 p-3 pt-0 sm:grid-cols-2 sm:p-4 sm:pt-0'>
            <ContentSurfaceCard surface='nested' className='space-y-4 p-4'>
              <div className='space-y-1'>
                <h2 className='text-[13px] font-semibold text-primary-token'>
                  Buttons
                </h2>
                <p className='text-[12px] text-secondary-token'>
                  Core actions in their default product styles.
                </p>
              </div>
              <div className='flex flex-wrap gap-3'>
                <Button>Primary</Button>
                <Button variant='secondary'>Secondary</Button>
                <Button variant='ghost'>Ghost</Button>
              </div>
            </ContentSurfaceCard>

            <ContentSurfaceCard surface='nested' className='space-y-4 p-4'>
              <div className='space-y-1'>
                <h2 className='text-[13px] font-semibold text-primary-token'>
                  Inputs
                </h2>
                <p className='text-[12px] text-secondary-token'>
                  Baseline form controls for product-surface checks.
                </p>
              </div>
              <div className='space-y-3'>
                <Input placeholder='Placeholder' />
                <Input type='password' placeholder='Password' />
              </div>
            </ContentSurfaceCard>
          </div>
        </ContentSurfaceCard>
      </div>
    </StandaloneProductPage>
  );
}
