'use client';

import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';

interface ProfileViewportShellProps {
  readonly ambientImageUrl?: string | null;
  readonly artistName: string;
  readonly children: React.ReactNode;
}

export function ProfileViewportShell({
  ambientImageUrl,
  artistName,
  children,
}: ProfileViewportShellProps) {
  return (
    <div className='relative min-h-[100dvh] overflow-hidden bg-base text-primary-token'>
      <div className='absolute inset-0 hidden md:block' aria-hidden='true'>
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_26%),linear-gradient(180deg,rgba(8,9,10,0.66)_0%,rgba(8,9,10,0.94)_68%)]' />
        <div className='absolute inset-[-8%]'>
          <ImageWithFallback
            src={ambientImageUrl}
            alt={`${artistName} background`}
            fill
            sizes='100vw'
            className='scale-[1.08] object-cover opacity-20 blur-3xl saturate-[0.9]'
            fallbackVariant='avatar'
            fallbackClassName='bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_48%)]'
          />
        </div>
      </div>

      <div className='relative flex min-h-[100dvh] items-stretch justify-center md:px-6 md:py-6'>
        <div
          className='relative h-[100dvh] w-full overflow-hidden bg-base md:h-[min(920px,calc(100dvh-48px))] md:max-w-[440px] md:rounded-xl md:border md:border-subtle/80 md:shadow-[0_28px_80px_rgba(0,0,0,0.42)]'
          data-testid='profile-viewport-shell'
        >
          {children}
        </div>
      </div>
    </div>
  );
}
