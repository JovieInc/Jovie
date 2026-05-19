import { Skeleton } from '@jovie/ui';

/**
 * Route-level loading skeleton for /start (unauth onboarding chat entry).
 *
 * Mirrors the empty-state layout of OnboardingChat + OnboardingInitialIntro:
 * centered intro heading + the composer surface region. This provides
 * instant visual stability during RSC streaming / hydration and eliminates
 * raw layout shift or "Securing chat..." jank on the unauth first-turn handoff.
 *
 * Matches the post-homepage-polish contract for the 4-stage perceived-jank path.
 */
export default function StartLoading() {
  return (
    <div
      className='relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-(--linear-app-content-surface)'
      aria-busy='true'
      aria-live='polite'
      data-testid='start-loading-skeleton'
    >
      {/* Match the OnboardingChat scroll + centered empty region */}
      <div className='relative flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8'>
        <div className='mx-auto flex min-h-full w-full max-w-[44rem] flex-col items-center justify-center gap-6 pb-8 text-center'>
          {/* Intro heading skeleton (matches OnboardingInitialIntro) */}
          <div className='mx-auto flex w-full max-w-[34rem] flex-col items-center'>
            <Skeleton
              className='h-9 w-[18rem] sm:h-10 sm:w-[22rem]'
              rounded='lg'
            />
            <Skeleton
              className='mt-3 h-5 w-[16rem] sm:h-6 sm:w-[20rem]'
              rounded='lg'
            />
          </div>

          {/* Composer surface skeleton (hero-style empty state) */}
          <div className='mx-auto w-full max-w-[45rem]'>
            <div
              className='overflow-hidden rounded-[32px] border border-[color-mix(in_oklab,var(--linear-app-frame-seam)_84%,transparent)] bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.012)_100%),var(--linear-app-content-surface)] shadow-[0_18px_56px_-30px_rgba(0,0,0,0.86)]'
              aria-hidden='true'
            >
              <div className='relative flex items-end gap-2 px-4 py-3 sm:px-5 sm:py-3.5'>
                {/* Attach / plus button placeholder */}
                <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-(--linear-app-frame-seam) bg-surface-0 opacity-60'>
                  <Skeleton className='h-4 w-4' rounded='full' />
                </div>

                {/* Textarea placeholder line */}
                <div className='min-w-0 flex-1 py-1.5'>
                  <Skeleton className='h-5 w-[65%] sm:w-[55%]' rounded='full' />
                </div>

                {/* Mic + Send button placeholders */}
                <div className='flex items-center gap-2'>
                  <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-(--linear-app-frame-seam) bg-surface-0 opacity-60'>
                    <Skeleton className='h-4 w-4' rounded='full' />
                  </div>
                  <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-(--linear-app-frame-seam) bg-surface-0 opacity-60'>
                    <Skeleton className='h-4 w-4' rounded='full' />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Subtle prompt hint row to match empty state density */}
          <div className='flex flex-wrap justify-center gap-2 pt-1'>
            <Skeleton className='h-8 w-28 rounded-full' rounded='full' />
            <Skeleton className='h-8 w-24 rounded-full' rounded='full' />
            <Skeleton className='h-8 w-32 rounded-full' rounded='full' />
          </div>
        </div>
      </div>
    </div>
  );
}
