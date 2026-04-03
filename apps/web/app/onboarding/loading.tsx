/**
 * Loading skeleton for the onboarding page.
 *
 * Must match the OnboardingV2Form shell structure (sidebar + flat stage)
 * to prevent cumulative layout shift when the real content hydrates.
 */
import { OnboardingExperienceShell } from '@/components/features/onboarding/OnboardingExperienceShell';

const SIDEBAR_STEP_KEYS = [
  'handle',
  'spotify',
  'plan',
  'dsps',
  'social',
  'releases',
  'finish',
] as const;

function SidebarSkeleton() {
  return (
    <nav aria-label='Onboarding steps loading'>
      <ul className='space-y-1.5'>
        {SIDEBAR_STEP_KEYS.map(key => (
          <li key={key}>
            <div className='flex items-center gap-3 rounded-xl px-2 py-2'>
              <div className='h-4 w-4 shrink-0 rounded-full skeleton' />
              <div className='h-3.5 w-14 skeleton rounded-md' />
            </div>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function OnboardingLoading() {
  return (
    <OnboardingExperienceShell
      mode='standalone'
      stableStageHeight='tall'
      stageVariant='flat'
      sidebar={<SidebarSkeleton />}
      sidebarTitle='Jovie Setup'
      data-testid='onboarding-loading-shell'
    >
      {/* Matches the handle step layout: centered form with title + input + button */}
      <div className='flex flex-col items-center justify-center h-full'>
        <div className='w-full max-w-md flex flex-col'>
          <div className='flex flex-col items-center justify-center mb-8'>
            <div className='h-7 w-52 skeleton rounded-md' />
            <div className='h-5 w-72 skeleton rounded-md mt-2' />
          </div>

          <div className='rounded-xl border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,var(--linear-bg-surface-0))] p-4 sm:p-5'>
            <div className='space-y-3 w-full'>
              {/* Handle input skeleton */}
              <div className='flex w-full items-center gap-3 rounded-full border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_94%,var(--linear-bg-surface-0))] px-4 py-3'>
                <div className='h-4 w-3 skeleton rounded' />
                <div className='h-5 flex-1 skeleton rounded-md' />
              </div>

              {/* Validation message reserved space */}
              <div className='min-h-[24px]' />

              {/* CTA button skeleton */}
              <div className='h-11 w-full skeleton rounded-full' />
            </div>
          </div>

          {/* Footer hint reserved space */}
          <div className='min-h-[40px] mt-6' />
        </div>
      </div>
    </OnboardingExperienceShell>
  );
}
