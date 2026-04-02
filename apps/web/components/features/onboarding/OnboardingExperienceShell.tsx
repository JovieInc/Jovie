import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface OnboardingExperienceShellProps {
  readonly children: ReactNode;
  readonly rail?: ReactNode;
  readonly mobileRail?: ReactNode;
  readonly sidePanel?: ReactNode;
  readonly topBar?: ReactNode;
  readonly footer?: ReactNode;
  readonly mode?: 'standalone' | 'embedded';
  readonly stableStageHeight?: 'default' | 'tall';
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
    'mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-5 px-4 py-8 sm:px-6 lg:px-8',
  embedded:
    'mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8',
} as const;

const STAGE_HEIGHT_CLASSNAME = {
  default: 'min-h-[520px]',
  tall: 'min-h-[560px]',
} as const;

export function OnboardingExperienceShell({
  children,
  rail,
  mobileRail,
  sidePanel,
  topBar,
  footer,
  mode = 'standalone',
  stableStageHeight = 'default',
  className,
  stageClassName,
  'data-testid': testId,
}: Readonly<OnboardingExperienceShellProps>) {
  return (
    <div className={cn(ROOT_CLASSNAME[mode], className)} data-testid={testId}>
      <div className={CONTENT_CLASSNAME[mode]}>
        {mobileRail ? <div className='xl:hidden'>{mobileRail}</div> : null}

        <div className='flex min-h-0 flex-1 flex-col gap-8 xl:flex-row xl:items-start xl:gap-16'>
          {rail ? (
            <div className='hidden xl:block xl:w-[220px] xl:shrink-0'>
              {rail}
            </div>
          ) : null}

          <div className='flex min-h-0 min-w-0 flex-1 flex-col gap-4'>
            {topBar ? <div className='shrink-0'>{topBar}</div> : null}

            <div className='flex min-h-0 min-w-0 flex-1 flex-col gap-5 xl:flex-row'>
              <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
                <div
                  className={cn(
                    'flex min-h-0 min-w-0 flex-1 flex-col',
                    STAGE_HEIGHT_CLASSNAME[stableStageHeight],
                    stageClassName
                  )}
                >
                  {children}
                </div>
              </div>

              {sidePanel ? <div className='shrink-0'>{sidePanel}</div> : null}
            </div>
          </div>
        </div>
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
