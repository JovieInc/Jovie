'use client';

import Image from 'next/image';
import { BackgroundPattern } from '@/components/atoms/BackgroundPattern';
import { cn } from '@/lib/utils';

export interface PublicSurfaceShellProps {
  readonly ambientMediaUrl?: string | null;
  readonly backgroundPattern?: 'grid' | 'dots' | 'gradient' | 'none';
  readonly showGradientBlurs?: boolean;
  readonly children: React.ReactNode;
  readonly className?: string;
}

export function PublicSurfaceShell({
  ambientMediaUrl,
  backgroundPattern = 'none',
  showGradientBlurs = false,
  children,
  className,
}: Readonly<PublicSurfaceShellProps>) {
  return (
    <div
      className={cn(
        'profile-viewport relative h-[100dvh] overflow-clip bg-base text-primary-token md:h-auto md:min-h-[100dvh] md:overflow-x-hidden',
        className
      )}
    >
      {ambientMediaUrl ? (
        <div className='absolute inset-0' aria-hidden='true'>
          <div className='absolute inset-[-10%]'>
            <Image
              src={ambientMediaUrl}
              alt=''
              fill
              sizes='(max-width: 767px) 100vw, 680px'
              className='scale-[1.05] object-cover opacity-28 blur-[84px] saturate-[0.88]'
            />
          </div>
          <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_26%),linear-gradient(180deg,rgba(6,8,13,0.34)_0%,rgba(7,8,10,0.82)_42%,rgba(8,9,10,0.98)_100%)]' />
        </div>
      ) : null}

      {!ambientMediaUrl && backgroundPattern !== 'none' ? (
        <BackgroundPattern variant={backgroundPattern} />
      ) : null}

      {!ambientMediaUrl && showGradientBlurs ? (
        <>
          <div className='pointer-events-none absolute left-[12%] top-[14%] h-56 w-56 rounded-full bg-[color:var(--profile-stage-glow-a)] blur-3xl sm:h-72 sm:w-72 md:h-[26rem] md:w-[26rem]' />
          <div className='pointer-events-none absolute bottom-[10%] right-[10%] h-56 w-56 rounded-full bg-[color:var(--profile-stage-glow-b)] blur-3xl sm:h-72 sm:w-72 md:h-[24rem] md:w-[24rem]' />
        </>
      ) : null}

      {children}
    </div>
  );
}
