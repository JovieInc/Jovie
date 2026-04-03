/**
 * Loading skeleton for the onboarding page.
 */
import { OnboardingExperienceShell } from '@/components/features/onboarding/OnboardingExperienceShell';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

const ONBOARDING_PREVIEW_WIDTH_PX = 360;
const ONBOARDING_LOADING_METRIC_KEYS = [
  'releases',
  'platforms',
  'social',
] as const;

export default function OnboardingLoading() {
  return (
    <OnboardingExperienceShell
      mode='standalone'
      stableStageHeight='tall'
      stageVariant='flat'
      sidePanel={
        <aside
          className='hidden xl:block'
          style={{ width: `${ONBOARDING_PREVIEW_WIDTH_PX}px` }}
        >
          <div className='sticky top-8 space-y-4'>
            <ContentSurfaceCard className='space-y-4 p-5'>
              <div className='flex items-center gap-3'>
                <div className='h-14 w-14 rounded-full skeleton' />
                <div className='min-w-0 flex-1 space-y-2'>
                  <div className='h-4 w-28 skeleton rounded-md' />
                  <div className='h-3 w-20 skeleton rounded-md' />
                </div>
              </div>
              <div className='grid grid-cols-3 gap-2'>
                {ONBOARDING_LOADING_METRIC_KEYS.map(metricKey => (
                  <div
                    key={metricKey}
                    className='space-y-2 rounded-2xl bg-surface-0 px-3 py-2'
                  >
                    <div className='mx-auto h-4 w-8 skeleton rounded-md' />
                    <div className='mx-auto h-2.5 w-10 skeleton rounded-md' />
                  </div>
                ))}
              </div>
            </ContentSurfaceCard>

            <ContentSurfaceCard className='space-y-3 p-5'>
              <div className='h-3 w-24 skeleton rounded-md' />
              <div className='h-16 w-full skeleton rounded-xl' />
              <div className='h-10 w-full skeleton rounded-xl' />
              <div className='h-10 w-full skeleton rounded-xl' />
            </ContentSurfaceCard>
          </div>
        </aside>
      }
      data-testid='onboarding-loading-shell'
    >
      <div className='mx-auto w-full max-w-xl space-y-8'>
        <div className='h-2 w-full skeleton rounded-full' />

        <div className='space-y-3 text-center'>
          <div className='mx-auto h-10 w-64 skeleton rounded-md' />
          <div className='mx-auto h-5 w-80 skeleton rounded-md' />
        </div>

        <ContentSurfaceCard className='space-y-6 p-8'>
          <div className='flex justify-center'>
            <div className='h-24 w-24 skeleton rounded-full' />
          </div>

          <div className='space-y-4'>
            <div className='space-y-2'>
              <div className='h-4 w-24 skeleton rounded-md' />
              <div className='h-10 w-full skeleton rounded-md' />
            </div>
            <div className='space-y-2'>
              <div className='h-4 w-20 skeleton rounded-md' />
              <div className='h-10 w-full skeleton rounded-md' />
            </div>
            <div className='space-y-2'>
              <div className='h-4 w-16 skeleton rounded-md' />
              <div className='h-24 w-full skeleton rounded-md' />
            </div>
          </div>
        </ContentSurfaceCard>

        <div className='h-12 w-full skeleton rounded-lg' />
      </div>
    </OnboardingExperienceShell>
  );
}
