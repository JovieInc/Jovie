'use client';

import { cn } from '@/lib/utils';

export interface PublicSurfaceStageProps {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly panelClassName?: string;
  /** Optional content rendered below the stage card (desktop growth footer). */
  readonly afterPanel?: React.ReactNode;
}

export function PublicSurfaceStage({
  children,
  className,
  panelClassName,
  afterPanel,
}: Readonly<PublicSurfaceStageProps>) {
  return (
    <div
      className={cn(
        // min-h-dvh (not fixed h) so md:items-center has spare room when the
        // card is shorter than the viewport; natural scroll when content is taller.
        'relative mx-auto flex min-h-dvh w-full max-w-170 items-stretch justify-center md:items-center md:px-6 md:py-8',
        className
      )}
    >
      <main className='relative flex w-full flex-col items-stretch justify-center md:items-center'>
        <div
          className={cn(
            // Do not stretch the phone-frame to full viewport height (JOV-3544).
            'relative flex h-full w-full max-w-(--profile-shell-max-width) flex-col overflow-clip bg-(--profile-content-bg) md:mx-auto md:h-auto md:max-h-[min(920px,calc(100dvh-64px))] md:min-h-0 md:overflow-hidden md:rounded-(--profile-card-radius) md:border md:border-(--profile-panel-border) md:shadow-(--profile-panel-shadow)',
            panelClassName
          )}
        >
          <div className='pointer-events-none absolute inset-0 bg-(--profile-panel-gradient)' />
          {children}
        </div>
        {afterPanel}
      </main>
    </div>
  );
}
