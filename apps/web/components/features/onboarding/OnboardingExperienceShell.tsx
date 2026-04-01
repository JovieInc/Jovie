import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface OnboardingExperienceShellProps {
  readonly children: ReactNode;
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
    'mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-5 px-4 py-8 sm:px-6 lg:px-8 xl:flex-row xl:gap-10',
  embedded:
    'mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8 xl:flex-row xl:gap-8',
} as const;

const STAGE_HEIGHT_CLASSNAME = {
  default: 'min-h-[520px]',
  tall: 'min-h-[560px]',
} as const;

export function OnboardingExperienceShell({
  children,
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
      {topBar ? (
        <div className='shrink-0'>
          <div className='mx-auto w-full max-w-[1440px] px-4 pt-4 sm:px-6 lg:px-8'>
            {topBar}
          </div>
        </div>
      ) : null}

      <div className={CONTENT_CLASSNAME[mode]}>
        <div className='flex min-w-0 flex-1 flex-col'>
          <div
            className={cn(
              'flex min-w-0 flex-1 flex-col rounded-[32px] border border-(--linear-app-frame-seam) bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] px-5 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.18)] sm:px-8 sm:py-8',
              STAGE_HEIGHT_CLASSNAME[stableStageHeight],
              stageClassName
            )}
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
