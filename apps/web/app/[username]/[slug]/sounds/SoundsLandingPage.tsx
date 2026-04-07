'use client';

/**
 * SoundsLandingPage Component
 *
 * A public-facing landing page for the "Use this sound" feature.
 * Uses the same profile card shell as release and presave pages.
 */

import { Headphones, MoreHorizontal, Share2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { VIDEO_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { Icon } from '@/components/atoms/Icon';
import { ProfileDrawerShell } from '@/features/profile/ProfileDrawerShell';
import { SmartLinkPoweredByFooter } from '@/features/release/SmartLinkPagePrimitives';
import { SmartLinkProviderButton } from '@/features/release/SmartLinkProviderButton';
import type { VideoProviderKey } from '@/lib/discography/types';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';
import { appendUTMParamsToUrl, type PartialUTMParams } from '@/lib/utm';

export interface VideoProvider {
  key: VideoProviderKey;
  label: string;
  cta: string;
  accent: string;
  url: string;
}

interface SoundsLandingPageProps {
  readonly release: {
    readonly title: string;
    readonly artworkUrl: string | null;
  };
  readonly artist: {
    readonly name: string;
    readonly handle: string | null;
  };
  readonly videoProviders: VideoProvider[];
  readonly smartLinkPath: string;
  readonly utmParams?: PartialUTMParams;
  readonly tracking?: {
    readonly contentType: 'release' | 'track';
    readonly contentId: string;
    readonly smartLinkSlug?: string | null;
  };
}

const menuItemClass =
  'flex w-full items-center gap-3 rounded-[14px] px-4 py-3 text-left text-[14px] font-[470] text-white/88 transition-colors duration-150 active:bg-white/[0.06]';
const menuIconClass = 'h-[16px] w-[16px] text-white/40';

export function SoundsLandingPage({
  release,
  artist,
  videoProviders,
  smartLinkPath,
  utmParams = {},
  tracking,
}: Readonly<SoundsLandingPageProps>) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleProviderClick = useCallback(
    (providerKey: VideoProviderKey) => {
      if (!artist.handle || !tracking?.contentId || !tracking?.contentType)
        return;
      postJsonBeacon(
        '/api/track',
        {
          handle: artist.handle,
          linkType: 'listen',
          target: providerKey,
          source: 'link',
          context: {
            contentType: tracking.contentType,
            contentId: tracking.contentId,
            provider: providerKey,
            smartLinkSlug: tracking.smartLinkSlug ?? undefined,
          },
        },
        () => {}
      );
    },
    [artist.handle, tracking]
  );

  const handleShare = useCallback(async () => {
    setMenuOpen(false);
    try {
      await navigator.share?.({
        title: `${release.title} — ${artist.name}`,
        url: globalThis.location.href,
      });
    } catch {
      // User cancelled or share not available
    }
  }, [release.title, artist.name]);

  return (
    <div className='profile-viewport relative h-[100dvh] overflow-clip bg-base text-primary-token md:h-auto md:min-h-[100dvh] md:overflow-x-hidden'>
      {/* Ambient background */}
      {release.artworkUrl ? (
        <div className='absolute inset-0' aria-hidden='true'>
          <div className='absolute inset-[-10%]'>
            <Image
              src={release.artworkUrl}
              alt=''
              fill
              sizes='100vw'
              className='scale-[1.05] object-cover opacity-28 blur-[84px] saturate-[0.88]'
            />
          </div>
          <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_26%),linear-gradient(180deg,rgba(6,8,13,0.34)_0%,rgba(7,8,10,0.82)_42%,rgba(8,9,10,0.98)_100%)]' />
        </div>
      ) : null}

      {/* Card container */}
      <div className='relative mx-auto flex h-[100dvh] w-full max-w-[680px] items-stretch justify-center md:h-auto md:min-h-[100dvh] md:items-center md:px-6 md:py-8'>
        <main className='relative flex w-full items-stretch md:items-center'>
          <div className='relative flex h-full w-full max-w-[430px] flex-col overflow-clip bg-[color:var(--profile-content-bg)] md:h-auto md:mx-auto md:min-h-[min(920px,calc(100dvh-64px))] md:overflow-hidden md:rounded-[30px] md:border md:border-[color:var(--profile-panel-border)] md:shadow-[var(--profile-panel-shadow)]'>
            <div className='pointer-events-none absolute inset-0 bg-[var(--profile-panel-gradient)]' />

            {/* Hero — full-width artwork */}
            <header className='relative w-full shrink-0 aspect-[4/3] md:aspect-square'>
              <div className='absolute inset-0'>
                {release.artworkUrl ? (
                  <Image
                    src={release.artworkUrl}
                    alt={`${release.title} artwork`}
                    fill
                    priority
                    sizes='(max-width: 767px) 100vw, 430px'
                    className='object-cover object-center'
                  />
                ) : (
                  <div className='flex h-full w-full items-center justify-center bg-surface-2'>
                    <Icon
                      name='Disc3'
                      className='text-muted-foreground h-16 w-16'
                      aria-hidden='true'
                    />
                  </div>
                )}
              </div>

              {/* Vignettes */}
              <div className='pointer-events-none absolute inset-x-0 top-0 h-[36%] bg-[linear-gradient(to_bottom,rgba(0,0,0,0.45)_0%,rgba(0,0,0,0.15)_55%,transparent_100%)]' />
              <div className='pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-[linear-gradient(to_top,var(--profile-stage-bg,rgba(8,9,10,1))_0%,rgba(5,6,8,0.75)_45%,transparent_100%)]' />

              {/* Top bar */}
              <div className='relative z-10 flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),20px)]'>
                <BrandLogo
                  size={22}
                  tone='white'
                  rounded={false}
                  className='opacity-45 drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]'
                />
                <button
                  type='button'
                  onClick={() => setMenuOpen(true)}
                  className='flex h-8 w-8 items-center justify-center rounded-full border-white/[0.08] bg-black/25 text-white/70 backdrop-blur-2xl transition-colors duration-150 hover:bg-black/40'
                  aria-label='More options'
                  aria-haspopup='dialog'
                >
                  <MoreHorizontal className='h-[15px] w-[15px]' />
                </button>
              </div>

              {/* Title + artist */}
              <div className='absolute inset-x-0 bottom-5 z-10 px-5'>
                <p className='text-[11px] font-[510] uppercase tracking-[0.1em] text-white/50'>
                  Use this sound
                </p>
                <h1 className='mt-1 text-[28px] font-[590] leading-[1.06] tracking-[-0.02em] text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.4)]'>
                  {release.title}
                </h1>
                {artist.handle ? (
                  <Link
                    href={`/${artist.handle}`}
                    className='mt-1 block text-[14px] font-[450] text-white/70 transition-colors hover:text-white/90 [text-shadow:0_1px_8px_rgba(0,0,0,0.3)]'
                  >
                    {artist.name}
                  </Link>
                ) : (
                  <p className='mt-1 text-[14px] font-[450] text-white/70 [text-shadow:0_1px_8px_rgba(0,0,0,0.3)]'>
                    {artist.name}
                  </p>
                )}
              </div>
            </header>

            {/* Content — video platform buttons (scrollable) */}
            <div className='relative z-10 flex min-h-0 flex-1 flex-col px-5 pt-3'>
              <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide'>
                <div className='space-y-2'>
                  {videoProviders.map(provider => {
                    const logoConfig = VIDEO_LOGO_CONFIG[provider.key];
                    return (
                      <SmartLinkProviderButton
                        key={provider.key}
                        href={appendUTMParamsToUrl(provider.url, utmParams)}
                        onClick={() => handleProviderClick(provider.key)}
                        label={logoConfig?.name ?? provider.label}
                        iconPath={logoConfig?.iconPath}
                      />
                    );
                  })}
                </div>
              </div>

              <div className='shrink-0 pb-[max(env(safe-area-inset-bottom),8px)]'>
                <SmartLinkPoweredByFooter />
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Menu drawer */}
      <ProfileDrawerShell
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title='Menu'
      >
        <div className='flex flex-col gap-0.5' role='menu'>
          <button
            type='button'
            role='menuitem'
            className={menuItemClass}
            onClick={() => {
              void handleShare();
            }}
          >
            <Share2 className={menuIconClass} />
            Share
          </button>
          <Link
            href={appendUTMParamsToUrl(smartLinkPath, utmParams)}
            role='menuitem'
            className={menuItemClass}
            onClick={() => setMenuOpen(false)}
          >
            <Headphones className={menuIconClass} />
            Listen
          </Link>
        </div>
      </ProfileDrawerShell>
    </div>
  );
}
