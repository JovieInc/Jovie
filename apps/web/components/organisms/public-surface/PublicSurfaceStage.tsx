'use client';

import { cn } from '@/lib/utils';

export interface PublicSurfaceStageProps {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly panelClassName?: string;
}

export function PublicSurfaceStage({
  children,
  className,
  panelClassName,
}: Readonly<PublicSurfaceStageProps>) {
  return (
    <div
      className={cn(
        'relative mx-auto flex h-[100dvh] w-full max-w-[680px] items-stretch justify-center md:h-auto md:min-h-[100dvh] md:items-center md:px-6 md:py-8',
        className
      )}
    >
      <main className='relative flex w-full items-stretch md:items-center'>
        <div
          className={cn(
            'relative flex h-full w-full max-w-[430px] flex-col overflow-clip bg-[color:var(--profile-content-bg)] md:mx-auto md:min-h-[min(920px,calc(100dvh-64px))] md:overflow-hidden md:rounded-[30px] md:border md:border-[color:var(--profile-panel-border)] md:shadow-[var(--profile-panel-shadow)]',
            panelClassName
          )}
        >
          <div className='pointer-events-none absolute inset-0 bg-[var(--profile-panel-gradient)]' />
          {children}
        </div>
      </main>
    </div>
  );
}
