import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  ONBOARDING_STAGE_FLAT_CLASS,
  ONBOARDING_STAGE_FRAME_GEOMETRY_CLASS,
  ONBOARDING_STAGE_FRAMED_SURFACE_CLASS,
  ONBOARDING_STAGE_V1_SURFACE_CLASS,
} from './onboarding-experience-shell-stage-contract';

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
  readonly visualVariant?: 'default' | 'v1';
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
    'mx-auto flex min-h-screen w-full max-w-360 gap-5 px-4 py-8 max-lg:flex-col sm:px-6 lg:gap-10 lg:px-8',
  embedded:
    'mx-auto flex min-h-0 w-full max-w-360 flex-1 gap-5 px-4 py-6 max-lg:flex-col sm:px-6 lg:gap-8 lg:px-8',
} as const;

const STAGE_HEIGHT_CLASSNAME = {
  default: 'min-h-130',
  tall: 'min-h-140',
} as const;

const STAGE_VARIANT_CLASSNAME = {
  flat: ONBOARDING_STAGE_FLAT_CLASS,
  framed: [
    ONBOARDING_STAGE_FRAME_GEOMETRY_CLASS,
    ONBOARDING_STAGE_FRAMED_SURFACE_CLASS,
  ],
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
  visualVariant = 'default',
  className,
  stageClassName,
  'data-testid': testId,
}: Readonly<OnboardingExperienceShellProps>) {
  return (
    <div
      className={cn(
        ROOT_CLASSNAME[mode],
        visualVariant === 'v1' &&
          'bg-(--color-bg-base) bg-[radial-gradient(circle_at_52%_12%,rgba(103,232,249,0.10),transparent_32%)]',
        className
      )}
      data-testid={testId}
      data-onboarding-visual-variant={visualVariant}
    >
      {topBar ? (
        <div className='shrink-0'>
          <div className='mx-auto w-full max-w-360 px-4 pt-4 sm:px-6 lg:px-8'>
            {topBar}
          </div>
        </div>
      ) : null}

      <div className={CONTENT_CLASSNAME[mode]}>
        {sidebar ? (
          <aside className='shrink-0 max-lg:w-full lg:w-55 xl:w-60 2xl:w-65'>
            <div className='sticky top-8'>
              {sidebarTitle ? (
                <div className='border-b border-[color-mix(in_oklab,var(--linear-app-frame-seam)_68%,transparent)] pb-4'>
                  <p className='text-sm font-semibold tracking-tighter text-primary-token'>
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
              visualVariant === 'v1' && [
                ONBOARDING_STAGE_FRAME_GEOMETRY_CLASS,
                ONBOARDING_STAGE_V1_SURFACE_CLASS,
              ],
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
          <div className='mx-auto w-full max-w-360 px-4 pb-6 sm:px-6 lg:px-8'>
            {footer}
          </div>
        </div>
      ) : null}
    </div>
  );
}
