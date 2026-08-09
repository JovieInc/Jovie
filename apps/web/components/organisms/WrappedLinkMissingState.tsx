import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';

export function WrappedLinkMissingState() {
  return (
    <StandaloneProductPage width='sm' centered>
      <ContentSurfaceCard className='overflow-hidden' data-testid='not-found'>
        <ContentSectionHeader
          density='compact'
          title='Link Not Found'
          subtitle='The link you followed may be broken, expired, or unavailable.'
        />

        <div className='space-y-5 px-5 py-5 text-center sm:px-6'>
          <div className='mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-warning/20 bg-warning-subtle'>
            <AlertTriangle
              className='h-6 w-6 text-warning'
              aria-hidden='true'
            />
          </div>

          <p className='text-app leading-5 text-tertiary-token'>
            Check the URL or ask the sender for a fresh link.
          </p>

          <Link
            href='/'
            className='inline-flex h-9 items-center justify-center rounded-lg bg-btn-primary px-4 text-app font-medium text-btn-primary-foreground transition-colors duration-fast hover:bg-btn-primary-hover'
          >
            Return Home
          </Link>
        </div>
      </ContentSurfaceCard>
    </StandaloneProductPage>
  );
}
