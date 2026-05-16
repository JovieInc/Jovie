'use client';

import type { CSSProperties, ReactNode } from 'react';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { cn } from '@/lib/utils';

interface PublicProfileLayoutShellProps {
  readonly artistName: string;
  readonly heroImageUrl: string | null;
  readonly heroImageError: boolean;
  readonly onHeroImageLoadError: () => void;
  readonly isDesktopLayout: boolean;
  readonly shouldRenderHeading: boolean;
  readonly profileAccentStyle: CSSProperties;
  readonly desktopSurface: ReactNode;
  readonly compactSurface: ReactNode;
}

export function PublicProfileLayoutShell({
  artistName,
  heroImageUrl,
  heroImageError,
  onHeroImageLoadError,
  isDesktopLayout,
  shouldRenderHeading,
  profileAccentStyle,
  desktopSurface,
  compactSurface,
}: Readonly<PublicProfileLayoutShellProps>) {
  return (
    <div
      className='profile-viewport relative overflow-hidden bg-[color:var(--profile-stage-bg)] text-primary-token'
      style={{
        ...profileAccentStyle,
        height: 'calc(100dvh - var(--cookie-banner-h, 0px))',
      }}
      data-testid='public-profile-layout-shell'
    >
      <div className='absolute inset-0' aria-hidden='true'>
        <div className='absolute inset-[-10%]'>
          {heroImageUrl && !heroImageError ? (
            <ImageWithFallback
              src={heroImageUrl}
              alt={`${artistName} background`}
              fill
              sizes='(max-width: 767px) 100vw, 680px'
              className='scale-[1.05] object-cover object-center opacity-28 blur-[84px] saturate-[0.88]'
              fallbackVariant='avatar'
              fallbackClassName='bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_48%)]'
              onLoadError={onHeroImageLoadError}
            />
          ) : (
            <div className='h-full w-full bg-[radial-gradient(circle_at_top,var(--profile-stage-glow-a),transparent_44%)] opacity-50' />
          )}
        </div>
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_26%),linear-gradient(180deg,rgba(6,8,13,0.34)_0%,rgba(7,8,10,0.82)_42%,rgba(8,9,10,0.98)_100%)]' />
      </div>

      <div
        className={cn(
          'public-profile-layout-frame relative mx-auto flex w-full items-stretch justify-center',
          isDesktopLayout
            ? 'public-profile-layout-frame--desktop'
            : 'public-profile-layout-frame--compact md:items-center'
        )}
        data-layout={isDesktopLayout ? 'desktop' : 'compact'}
      >
        <main className='relative flex h-full min-w-0 w-full items-stretch md:items-center'>
          {shouldRenderHeading ? (
            <h1 className='sr-only'>{artistName}</h1>
          ) : null}
          {isDesktopLayout ? (
            <div
              className='public-profile-layout-desktop-shell'
              data-testid='profile-desktop-shell'
            >
              {desktopSurface}
            </div>
          ) : null}
          <div className='public-profile-layout-compact-slot'>
            {compactSurface}
          </div>
        </main>
      </div>
    </div>
  );
}
