import { OnboardingExperienceShell } from '@/components/features/onboarding/OnboardingExperienceShell';

const SIDEBAR_STEPS = [
  'Handle',
  'Spotify',
  'Plan',
  'DSPs',
  'Social',
  'Releases',
  'Finish',
] as const;

function SidebarLoadingState() {
  return (
    <nav aria-label='Onboarding steps'>
      <ul className='space-y-1.5'>
        {SIDEBAR_STEPS.map(step => (
          <li key={step}>
            <div className='flex items-center gap-3 rounded-xl px-2 py-2'>
              <div
                className={
                  step === 'Handle'
                    ? 'h-4 w-4 shrink-0 rounded-full border border-primary-token bg-primary-token'
                    : 'h-4 w-4 shrink-0 rounded-full border border-(--linear-app-frame-seam) bg-transparent'
                }
              />
              <span
                className={
                  step === 'Handle'
                    ? 'text-sm font-semibold text-primary-token'
                    : 'text-sm text-secondary-token'
                }
              >
                {step}
              </span>
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
      sidebar={<SidebarLoadingState />}
      sidebarTitle='Jovie Setup'
      data-testid='onboarding-loading-shell'
    >
      <div className='flex h-full flex-col items-center justify-center'>
        <div className='flex w-full max-w-md flex-col items-center text-center'>
          <div className='mb-8 space-y-2'>
            <h1 className='text-[30px] font-[590] leading-[1.05] tracking-[-0.03em] text-primary-token sm:text-[36px]'>
              Preparing your setup
            </h1>
            <p className='text-[15px] leading-6 text-secondary-token'>
              Loading your handle step and profile context.
            </p>
          </div>

          <div className='w-full rounded-xl border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,var(--linear-bg-surface-0))] p-4 sm:p-5'>
            <div className='flex w-full items-center gap-3 rounded-full border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_94%,var(--linear-bg-surface-0))] px-4 py-3'>
              <span className='text-[13px] text-tertiary-token'>@</span>
              <div className='h-2 flex-1 rounded-full bg-[color-mix(in_oklab,var(--linear-app-frame-seam)_76%,transparent)]' />
            </div>
            <div className='mt-4 h-11 rounded-full bg-primary-token/14' />
          </div>
        </div>
      </div>
    </OnboardingExperienceShell>
  );
}
