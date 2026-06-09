'use client';

import type { ReactNode } from 'react';
import { JovieMarkElectric } from '@/components/atoms/JovieMarkElectric';

export function ChatEmptyStateComposerRegion({
  above,
  children,
}: {
  readonly above?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div
      className='relative mx-auto flex min-h-full w-full max-w-[52rem] flex-col items-center justify-center px-1 py-8'
      data-testid='chat-empty-state-composer-region'
    >
      <div
        className='pointer-events-none absolute left-1/2 top-1/2 h-[min(46vw,28rem)] w-[min(46vw,28rem)] -translate-x-1/2 -translate-y-[60%] opacity-70 drop-shadow-[0_0_34px_rgba(68,188,255,0.14)] max-sm:h-[min(72vw,18rem)] max-sm:w-[min(72vw,18rem)]'
        style={{
          maskImage:
            'radial-gradient(ellipse at center, black 38%, rgba(0,0,0,0.55) 56%, rgba(0,0,0,0.2) 72%, transparent 86%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, black 38%, rgba(0,0,0,0.55) 56%, rgba(0,0,0,0.2) 72%, transparent 86%)',
        }}
        data-testid='chat-empty-state-logo'
      >
        <JovieMarkElectric className='h-full w-full' />
      </div>
      {above ? (
        <div className='absolute inset-x-0 bottom-1/2 z-10 mb-12 max-h-[min(46vh,24rem)] overflow-y-auto overscroll-contain px-1 pb-1'>
          {above}
        </div>
      ) : null}
      <div
        className='relative z-10 w-full'
        data-testid='chat-empty-state-centered-composer'
      >
        {children}
      </div>
    </div>
  );
}
