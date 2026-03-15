import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

export default function SettingsBillingLoading() {
  return (
    <div className='mx-auto max-w-3xl pt-2'>
      <div className='space-y-8 pb-6 sm:pb-8'>
        <section className='scroll-mt-4'>
          {/* Static heading — visible immediately */}
          <div className='mb-6 space-y-2'>
            <h2 className='text-lg font-semibold tracking-tight text-primary-token'>
              Billing &amp; Subscription
            </h2>
            <p className='text-sm text-secondary-token'>
              Subscription, payment methods, and invoices.
            </p>
          </div>

          {/* Skeleton card matching SettingsBillingSection layout */}
          <ContentSurfaceCard className='overflow-hidden'>
            <ContentSectionHeaderSkeleton
              titleWidth='w-40'
              descriptionWidth='w-80'
              className='min-h-0 px-4 py-3'
            />
            <div className='space-y-3 px-4 py-3'>
              <div className='rounded-xl border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) p-3.5'>
                <LoadingSkeleton height='h-4' width='w-32' rounded='md' />
                <LoadingSkeleton
                  height='h-4'
                  width='w-full'
                  rounded='md'
                  className='mt-2'
                />
              </div>
              <LoadingSkeleton height='h-8' width='w-40' rounded='md' />
            </div>
          </ContentSurfaceCard>
        </section>
      </div>
    </div>
  );
}
