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
  readonly desktopSurface: ReactNode;
  readonly desktopBanner?: ReactNode;
  readonly previewExitHref?: string;
  /** Desktop spare-space growth CTA (JOV-3544). */
  readonly claimFooterHref?: string | null;
  readonly showClaimFooter?: boolean;
  /** True when this shell renders inside another page (marketing phone
   *  preview, dashboard preview) instead of as the outer profile document.
   *  Marks the viewport so the global html/body scroll lock in globals.css
   *  skips it — only the real outer profile document may lock (JOV-4932). */
  readonly embedded?: boolean;
}

export function PublicProfileLayoutShell({
  artistName,
  heroImageUrl,
  heroImageError,
  isDesktopLayout,
  shouldRenderHeading,
  profileAccentStyle,
  compactSurface,
  desktopSurface,
  desktopBanner,
  previewExitHref,
  claimFooterHref = null,
  showClaimFooter = false,
  embedded = false,
}: Readonly<PublicProfileLayoutShellProps>) {
  // The background blur stage is 84px blurred and 28% opaque — a CSS radial
  // gradient using the artist accent color is visually identical and eliminates
  // a redundant full-res image fetch (JOV-2263). The heroImageUrl / heroImageError
  // props are retained in the interface for API compatibility with callers.
  const hasAmbientBg = Boolean(heroImageUrl && !heroImageError);
  return (
    <div
      className={cn(
        'profile-viewport relative h-dvh overflow-hidden bg-(--profile-stage-bg) text-primary-token md:h-auto md:min-h-dvh md:overflow-x-hidden md:overflow-y-auto',
        embedded && 'profile-viewport--embedded'
      )}
      style={profileAccentStyle}
      data-testid='public-profile-layout-shell'
      data-layout={isDesktopLayout ? 'desktop' : 'compact'}
      data-profile-preview={embedded ? 'true' : undefined}
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
            ? 'public-profile-layout-frame--desktop min-h-dvh items-center'
            : 'public-profile-layout-frame--compact min-h-dvh items-stretch md:items-center'
        )}
        data-layout={isDesktopLayout ? 'desktop' : 'compact'}
      >
        <main className='relative flex min-h-0 min-w-0 w-full flex-col items-center justify-center'>
          {shouldRenderHeading ? (
            <h1 className='sr-only'>{artistName}</h1>
          ) : null}
          <div className='public-profile-layout-compact-slot'>
            {!isDesktopLayout && embedded ? (
              <div className='profile-preview-frame flex h-full min-h-0 w-full flex-col overflow-hidden rounded-(--profile-shell-card-radius) border border-(--profile-panel-border) bg-(--profile-content-bg) shadow-(--profile-panel-shadow)'>
                <div className='flex min-h-11 shrink-0 items-center justify-between border-(--profile-panel-border) border-b px-4'>
                  <span
                    className='text-sm font-medium text-secondary-token'
                    data-testid='profile-preview-label'
                  >
                    Preview
                  </span>
                  <a
                    className='inline-flex min-h-11 items-center text-sm font-medium text-primary-token underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2'
                    data-testid='profile-preview-exit'
                    href={previewExitHref ?? '/'}
                  >
                    Open full profile
                  </a>
                </div>
                <div className='min-h-0 flex-1'>{compactSurface}</div>
              </div>
            ) : !isDesktopLayout ? (
              compactSurface
            ) : null}
          </div>
          <div
            className='public-profile-layout-desktop-shell overflow-hidden rounded-3xl'
            data-testid='profile-desktop-shell'
          >
            {desktopBanner ? (
              <div
                className='relative z-20 w-full shrink-0 overflow-hidden rounded-t-3xl'
                data-testid='profile-desktop-banner'
              >
                {desktopBanner}
              </div>
            ) : null}
            {isDesktopLayout ? (
              desktopSurface
            ) : (
              <div
                className='public-profile-layout-desktop-placeholder'
                data-testid='profile-desktop-loading'
                role='status'
                aria-busy='true'
              >
                <span className='text-secondary-token'>Loading profile…</span>
              </div>
            )}
          </div>
          {showClaimFooter && claimFooterHref ? (
            <ProfileClaimFooter href={claimFooterHref} enabled />
          ) : null}
        </main>
      </div>
    </div>
  );
}
