/**
 * Loading skeleton for the onboarding page.
 */
import { OnboardingExperienceShell } from '@/components/features/onboarding/OnboardingExperienceShell';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

const ONBOARDING_LOADING_RAIL_ITEMS = [
  'Claim Handle',
  'Find Your Spotify',
  'Confirm Artist',
  'Upgrade',
  'Review DSPs',
  'Review Socials',
  'Review Releases',
  'Finish Profile',
] as const;

export default function OnboardingLoading() {
  return (
    <OnboardingExperienceShell
      mode='standalone'
      stableStageHeight='tall'
      rail={
        <div className='space-y-5 pt-1'>
          <div className='h-4 w-24 skeleton rounded-md' />
          <div className='space-y-2'>
            {ONBOARDING_LOADING_RAIL_ITEMS.map(item => (
              <div key={item} className='flex items-center gap-3 py-1'>
                <div className='h-2.5 w-2.5 shrink-0 skeleton rounded-full' />
                <div className='h-3 w-32 skeleton rounded-md' />
              </div>
            ))}
          </div>
        </div>
      }
      mobileRail={
        <div className='space-y-4'>
          <div className='h-4 w-24 skeleton rounded-md' />
          <div className='grid grid-cols-4 gap-2 sm:grid-cols-8'>
            {ONBOARDING_LOADING_RAIL_ITEMS.map(item => (
              <div key={item} className='h-2 skeleton rounded-full' />
            ))}
          </div>
        </div>
      }
      data-testid='onboarding-loading-shell'
    >
      <div className='mx-auto w-full max-w-2xl space-y-8'>
        <div className='space-y-3'>
          <div className='h-10 w-64 skeleton rounded-md' />
          <div className='h-5 w-80 max-w-full skeleton rounded-md' />
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
