'use client';

/**
 * SoundsLandingPage Component
 *
 * A public-facing landing page for the "Use this sound" feature.
 * Uses SmartLinkShell for the shared profile card layout.
 */

import { Headphones, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { VIDEO_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { ProfileDrawerShell } from '@/features/profile/ProfileDrawerShell';
import { SmartLinkPoweredByFooter } from '@/features/release/SmartLinkPagePrimitives';
import { SmartLinkProviderButton } from '@/features/release/SmartLinkProviderButton';
import {
  SMART_LINK_MENU_ICON_CLASS,
  SMART_LINK_MENU_ITEM_CLASS,
  SmartLinkShell,
} from '@/features/release/SmartLinkShell';
import { PublicShareActionList } from '@/features/share/PublicShareMenu';
import type { VideoProviderKey } from '@/lib/discography/types';
import { buildReleaseShareContext } from '@/lib/share/context';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';
import {
  appendUTMParamsToUrl,
  extractUTMParams,
  type PartialUTMParams,
} from '@/lib/utm';

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

export function SoundsLandingPage({
  release,
  artist,
  videoProviders,
  smartLinkPath,
  utmParams = {},
  tracking,
}: Readonly<SoundsLandingPageProps>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const resolvedUtmParams = useMemo(() => {
    if (globalThis.window === undefined) {
      return utmParams;
    }

    const currentUtmParams = extractUTMParams(
      new URLSearchParams(globalThis.location.search)
    );

    return Object.keys(currentUtmParams).length > 0
      ? currentUtmParams
      : utmParams;
  }, [utmParams]);

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

  useEffect(() => {
    if (!artist.handle || !tracking?.contentId || !tracking?.contentType) {
      return;
    }

    postJsonBeacon(
      '/api/track',
      {
        handle: artist.handle,
        linkType: 'listen',
        target: 'sounds_page',
        source: 'link',
        context: {
          contentType: tracking.contentType,
          contentId: tracking.contentId,
          smartLinkSlug: tracking.smartLinkSlug ?? undefined,
        },
      },
      () => {}
    );
  }, [artist.handle, tracking]);

  const shareContext = useMemo(() => {
    const slug = smartLinkPath.split('/').at(-1) ?? 'release';
    return buildReleaseShareContext({
      username: artist.handle ?? 'r',
      slug,
      title: release.title,
      artistName: artist.name,
      artworkUrl: release.artworkUrl,
      pathname: artist.handle
        ? `/${artist.handle}/${slug}/sounds`
        : smartLinkPath,
      storyQueryParams: artist.handle
        ? undefined
        : {
            slug,
            title: release.title,
            artistName: artist.name,
            pathname: smartLinkPath,
            artworkUrl: release.artworkUrl,
          },
    });
  }, [
    artist.handle,
    artist.name,
    release.artworkUrl,
    release.title,
    smartLinkPath,
  ]);

  return (
    <SmartLinkShell
      artworkUrl={release.artworkUrl}
      artworkAlt={`${release.title} artwork`}
      onMenuOpen={() => setMenuOpen(true)}
      heroOverlay={
        <div className='absolute inset-x-0 bottom-5 z-10 px-5'>
          <h1 className='text-[28px] font-semibold leading-[1.06] tracking-[-0.02em] text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.4)]'>
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
      }
    >
      {/* Content — video platform buttons (scrollable) */}
      <div className='relative z-10 flex min-h-0 flex-1 flex-col px-5 pt-3'>
        <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide'>
          <div className='space-y-2'>
            {videoProviders.map(provider => {
              const logoConfig = VIDEO_LOGO_CONFIG[provider.key];
              return (
                <SmartLinkProviderButton
                  key={provider.key}
                  href={appendUTMParamsToUrl(provider.url, resolvedUtmParams)}
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
      {/* Menu drawer */}
      <ProfileDrawerShell
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title='Menu'
      >
        <div className='flex flex-col gap-0.5'>
          <button
            type='button'
            className={SMART_LINK_MENU_ITEM_CLASS}
            onClick={() => {
              setMenuOpen(false);
              setShareOpen(true);
            }}
          >
            <Share2 className={SMART_LINK_MENU_ICON_CLASS} />
            Share
          </button>
          <Link
            href={appendUTMParamsToUrl(smartLinkPath, resolvedUtmParams)}
            className={SMART_LINK_MENU_ITEM_CLASS}
            onClick={() => setMenuOpen(false)}
          >
            <Headphones className={SMART_LINK_MENU_ICON_CLASS} />
            Listen
          </Link>
        </div>
      </ProfileDrawerShell>
      <ProfileDrawerShell
        open={shareOpen}
        onOpenChange={setShareOpen}
        title='Share'
        subtitle='Share this page'
      >
        <PublicShareActionList
          context={shareContext}
          onActionComplete={() => setShareOpen(false)}
        />
      </ProfileDrawerShell>
    </SmartLinkShell>
  );
}
