'use client';

import type { CSSProperties, ReactNode } from 'react';
import { ProfileClaimFooter } from '@/features/profile/ProfileClaimFooter';
import { cn } from '@/lib/utils';

interface PublicProfileLayoutShellProps {
  readonly artistName: string;
  readonly heroImageUrl: string | null;
  readonly heroImageError: boolean;
  /** Retained for API compatibility — no longer used since the blur bg
   *  switched to a CSS-only radial gradient (JOV-2263). */
  readonly onHeroImageLoadError?: () => void;
  readonly isDesktopLayout: boolean;
  readonly shouldRenderHeading: boolean;
  readonly profileAccentStyle: CSSProperties;
  readonly compactSurface: ReactNode;
  /** Desktop spare-space growth CTA (JOV-3544). */
  readonly claimFooterHref?: string | null;
  readonly showClaimFooter?: boolean;
}

export function PublicProfileLayoutShell({
  artistName,
  heroImageUrl,
  heroImageError,
  isDesktopLayout,
  shouldRenderHeading,
  profileAccentStyle,
  compactSurface,
  claimFooterHref = null,
  showClaimFooter = false,
}: Readonly<PublicProfileLayoutShellProps>) {
  // The background blur stage is 84px blurred and 28% opaque — a CSS radial
  // gradient using the artist accent color is visually identical and eliminates
  // a redundant full-res image fetch (JOV-2263). The heroImageUrl / heroImageError
  // props are retained in the interface for API compatibility with callers.
  const hasAmbientBg = Boolean(heroImageUrl && !heroImageError);
  return (
    <div
      className='profile-viewport relative h-[calc(100dvh-var(--cookie-banner-h,0px))] overflow-hidden bg-(--profile-stage-bg) text-primary-token md:h-auto md:min-h-[calc(100dvh-var(--cookie-banner-h,0px))] md:overflow-x-hidden md:overflow-y-auto'
      style={profileAccentStyle}
      data-testid='public-profile-layout-shell'
    >
      <div className='absolute inset-0' aria-hidden='true'>
        <div className='absolute inset-0 sm:inset-[-10%]'>
          <div
            className={cn(
              'h-full w-full',
              hasAmbientBg
                ? 'bg-[radial-gradient(circle_at_50%_30%,var(--profile-stage-glow-a,rgba(255,255,255,0.18)),transparent_60%)] opacity-50'
                : 'bg-[radial-gradient(circle_at_top,var(--profile-stage-glow-a),transparent_44%)] opacity-50'
            )}
          />
        </div>
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_26%),linear-gradient(180deg,rgba(6,8,13,0.34)_0%,rgba(7,8,10,0.82)_42%,rgba(8,9,10,0.98)_100%)]' />
      </div>

      <div
        className={cn(
          'public-profile-layout-frame relative mx-auto flex w-full justify-center',
          // Center the stable stage container (not per-content height) so
          // mode/tab switches do not reflow vertical position (JOV-1369).
          isDesktopLayout
            ? 'public-profile-layout-frame--desktop min-h-[calc(100dvh-var(--cookie-banner-h,0px))] items-center'
            : 'public-profile-layout-frame--compact min-h-[calc(100dvh-var(--cookie-banner-h,0px))] items-stretch md:items-center'
        )}
        data-layout={isDesktopLayout ? 'desktop' : 'compact'}
      >
        <main className='relative flex min-h-0 min-w-0 w-full flex-col items-center justify-center'>
          {shouldRenderHeading ? (
            <h1 className='sr-only'>{artistName}</h1>
          ) : null}
          <div className='public-profile-layout-compact-slot'>
            {compactSurface}
          </div>
          {showClaimFooter && claimFooterHref ? (
            <ProfileClaimFooter href={claimFooterHref} enabled />
          ) : null}
        </main>
      </div>
    </div>
  );
}
