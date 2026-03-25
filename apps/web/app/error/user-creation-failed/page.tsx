import { Button } from '@jovie/ui';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { APP_ROUTES } from '@/constants/routes';

export const runtime = 'nodejs';

export default function UserCreationFailedPage() {
  return (
    <StandaloneProductPage width='sm' centered>
      <ContentSurfaceCard className='overflow-hidden'>
        <ContentSectionHeader
          density='compact'
          title='Account setup error'
          subtitle="We're having trouble setting up your account. This is usually temporary."
        />

        <div className='space-y-5 px-5 py-5 text-center sm:px-6'>
          <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--linear-warning)_32%,var(--linear-app-frame-seam))] bg-[color-mix(in_oklab,var(--linear-warning)_10%,var(--linear-app-content-surface))]'>
            <AlertTriangle
              className='h-5 w-5 text-[var(--linear-warning)]'
              aria-hidden='true'
            />
          </div>

          <p className='text-[13px] leading-5 text-secondary-token'>
            Our team has been notified and is working to resolve this issue.
            Please try again in a few minutes.
          </p>

          <div className='flex flex-col gap-2 sm:flex-row'>
            <Button asChild className='flex-1'>
              <Link href={APP_ROUTES.DASHBOARD}>Try again</Link>
            </Button>
            <Button asChild variant='secondary' className='flex-1'>
              <a href='mailto:support@jov.ie?subject=Account%20Setup%20Error'>
                Contact support
              </a>
            </Button>
          </div>

          <p className='text-[11px] uppercase tracking-[0.14em] text-tertiary-token'>
            Error code: USER_CREATION_FAILED
          </p>
        </div>
      </ContentSurfaceCard>
    </StandaloneProductPage>
  );
}
