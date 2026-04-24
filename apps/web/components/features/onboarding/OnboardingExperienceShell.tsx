import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface OnboardingExperienceShellProps {
  readonly children: ReactNode;
  readonly sidebar?: ReactNode;
  readonly sidebarTitle?: string;
  readonly sidePanel?: ReactNode;
  readonly topBar?: ReactNode;
  readonly footer?: ReactNode;
  readonly mode?: 'standalone' | 'embedded';
  readonly stableStageHeight?: 'default' | 'tall';
  readonly stageVariant?: 'framed' | 'flat';
  readonly className?: string;
  readonly stageClassName?: string;
  readonly 'data-testid'?: string;
}

const ROOT_CLASSNAME = {
  standalone: 'min-h-screen bg-page text-primary-token [color-scheme:dark]',
  embedded:
    'flex min-h-0 flex-1 flex-col bg-page text-primary-token [color-scheme:dark]',
} as const;

const CONTENT_CLASSNAME = {
  standalone:
    'mx-auto flex min-h-screen w-full max-w-[1440px] gap-5 px-4 py-8 max-lg:flex-col sm:px-6 lg:gap-10 lg:px-8',
  embedded:
    'mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 gap-5 px-4 py-6 max-lg:flex-col sm:px-6 lg:gap-8 lg:px-8',
} as const;

const STAGE_HEIGHT_CLASSNAME = {
  default: 'min-h-[520px]',
  tall: 'min-h-[560px]',
} as const;

const STAGE_VARIANT_CLASSNAME = {
  flat: 'px-0 py-2 sm:px-0 sm:py-3',
  framed:
    'rounded-[32px] border border-(--linear-app-frame-seam) bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] px-5 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.18)] sm:px-8 sm:py-8',
} as const;

export function OnboardingExperienceShell({
  children,
  sidebar,
  sidebarTitle,
  sidePanel,
  topBar,
  footer,
  mode = 'standalone',
  stableStageHeight = 'default',
  stageVariant = 'framed',
  className,
  stageClassName,
  'data-testid': testId,
}: Readonly<OnboardingExperienceShellProps>) {
  return (
    <div className={cn(ROOT_CLASSNAME[mode], className)} data-testid={testId}>
      {topBar ? (
        <div className='shrink-0'>
          <div className='mx-auto w-full max-w-[1440px] px-4 pt-4 sm:px-6 lg:px-8'>
            {topBar}
          </div>
        </div>
      ) : null}

      <div className={CONTENT_CLASSNAME[mode]}>
        {sidebar ? (
          <aside className='shrink-0 max-lg:w-full lg:w-[220px] xl:w-[240px] 2xl:w-[260px]'>
            <div className='sticky top-8'>
              {sidebarTitle ? (
                <div className='border-b border-[color-mix(in_oklab,var(--linear-app-frame-seam)_68%,transparent)] pb-4'>
                  <p className='text-[14px] font-semibold tracking-[-0.02em] text-primary-token'>
                    {sidebarTitle}
                  </p>
                </div>
              ) : null}
              <div className={cn(sidebarTitle ? 'pt-4' : '')}>{sidebar}</div>
            </div>
          </aside>
        ) : null}

        <div className='flex min-w-0 flex-1 flex-col'>
          <div
            className={cn(
              'flex min-w-0 flex-1 flex-col pt-[12vh]',
              STAGE_HEIGHT_CLASSNAME[stableStageHeight],
              STAGE_VARIANT_CLASSNAME[stageVariant],
              stageClassName
            )}
            data-testid={`onboarding-stage-${stageVariant}`}
            data-stage-variant={stageVariant}
          >
            {children}
          </div>
        </div>

        {sidePanel ? <div className='shrink-0'>{sidePanel}</div> : null}
      </div>

      {footer ? (
        <div className='shrink-0'>
          <div className='mx-auto w-full max-w-[1440px] px-4 pb-6 sm:px-6 lg:px-8'>
            {footer}
          </div>
        </div>
      ) : null}
    </div>
  );
}
