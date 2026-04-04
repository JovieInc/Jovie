'use client';

import { Bell, Mail, MoreHorizontal, Play, Share2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { SocialLink } from '@/components/molecules/SocialLink';
import {
  ProfileNotificationsContext,
  useProfileShell,
} from '@/components/organisms/profile-shell';
import { BASE_URL } from '@/constants/app';
import { ContactDrawer } from '@/features/profile/artist-contacts-button/ContactDrawer';
import { useArtistContacts } from '@/features/profile/artist-contacts-button/useArtistContacts';
import {
  ArtistNotificationsCTA,
  TwoStepNotificationsCTA,
} from '@/features/profile/artist-notifications-cta';
import type { ProfileMode } from '@/features/profile/contracts';
import { ListenDrawer } from '@/features/profile/ListenDrawer';
import { ProfileFeaturedCard } from '@/features/profile/ProfileFeaturedCard';
import { sortDSPsByGeoPopularity } from '@/lib/dsp';
import { getCanonicalProfileDSPs } from '@/lib/profile-dsps';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import { getHeaderSocialLinks } from '@/lib/utils/context-aware-links';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';

interface ProfileCompactTemplateProps {
  readonly mode: ProfileMode;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly latestRelease?: {
    readonly title: string;
    readonly slug: string;
    readonly artworkUrl: string | null;
    readonly releaseDate: Date | string | null;
    readonly releaseType: string;
  } | null;
  readonly enableDynamicEngagement?: boolean;
  readonly subscribeTwoStep?: boolean;
  readonly genres?: string[] | null;
  readonly photoDownloadSizes?: AvatarSize[];
  readonly tourDates?: { readonly id: string }[];
  readonly visitTrackingToken?: string;
  readonly viewerCountryCode?: string | null;
}

function unwrapNextImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, 'http://localhost');
    if (parsed.pathname !== '/_next/image') return url;
    return parsed.searchParams.get('url') ?? url;
  } catch {
    return url;
  }
}

export function ProfileCompactTemplate({
  mode,
  artist,
  socialLinks,
  contacts,
  latestRelease,
  enableDynamicEngagement = false,
  subscribeTwoStep = false,
  photoDownloadSizes = [],
  tourDates = [],
  visitTrackingToken,
  viewerCountryCode,
}: ProfileCompactTemplateProps) {
  const [listenOpen, setListenOpen] = useState(mode === 'listen');
  const [contactOpen, setContactOpen] = useState(mode === 'contact');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const subscribeSectionRef = useRef<HTMLElement | null>(null);

  const mergedDSPs = useMemo(
    () =>
      sortDSPsByGeoPopularity(
        getCanonicalProfileDSPs(artist, socialLinks),
        viewerCountryCode
      ),
    [artist, socialLinks, viewerCountryCode]
  );

  const heroImageUrl = useMemo(() => {
    return unwrapNextImageUrl(
      photoDownloadSizes.find(size => size.key === 'large')?.url ??
        photoDownloadSizes.find(size => size.key === 'original')?.url ??
        artist.image_url ??
        null
    );
  }, [artist.image_url, photoDownloadSizes]);

  const initialSource = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(globalThis.location.search).get('source');
  }, []);

  const { notificationsContextValue } = useProfileShell({
    artist,
    socialLinks,
    viewerCountryCode,
    contacts,
    visitTrackingToken,
    modeOverride: mode,
    sourceOverride: initialSource,
  });

  const {
    available: availableContacts,
    primaryChannel,
    isEnabled: hasContacts,
  } = useArtistContacts({
    contacts,
    artistHandle: artist.handle,
  });

  const visibleSocialLinks = useMemo(() => {
    return getHeaderSocialLinks(socialLinks, viewerCountryCode, 4);
  }, [socialLinks, viewerCountryCode]);

  const handlePlayClick = useCallback(() => {
    if (mergedDSPs.length === 0) {
      subscribeSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      return;
    }
    setListenOpen(true);
  }, [mergedDSPs.length]);

  const handleShare = useCallback(async () => {
    const profileUrl = `${BASE_URL}/${artist.handle}`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: artist.name, url: profileUrl });
      } else {
        await navigator.clipboard.writeText(profileUrl);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(profileUrl);
      } catch {
        // Silent failure
      }
    }
    setMenuOpen(false);
  }, [artist.handle, artist.name]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Close menu on escape
  useEffect(() => {
    if (!menuOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [menuOpen]);

  const menuItemClassName =
    'flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[14px] font-[510] text-white/90 transition-colors hover:bg-white/10';

  return (
    <ProfileNotificationsContext.Provider value={notificationsContextValue}>
      <div className='profile-viewport relative min-h-[100dvh] overflow-x-hidden bg-[color:var(--profile-stage-bg)] text-primary-token'>
        {/* Ambient background */}
        <div className='absolute inset-0' aria-hidden='true'>
          <div className='absolute inset-[-10%]'>
            <ImageWithFallback
              src={heroImageUrl}
              alt={`${artist.name} background`}
              fill
              sizes='100vw'
              className='scale-[1.05] object-cover opacity-28 blur-[84px] saturate-[0.88]'
              fallbackVariant='avatar'
              fallbackClassName='bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_48%)]'
            />
          </div>
          <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_26%),linear-gradient(180deg,rgba(6,8,13,0.34)_0%,rgba(7,8,10,0.82)_42%,rgba(8,9,10,0.98)_100%)]' />
        </div>

        {/* Card container */}
        <div className='relative mx-auto flex min-h-[100dvh] w-full max-w-[680px] items-stretch justify-center md:items-center md:px-6 md:py-8'>
          <main className='relative flex w-full items-stretch md:items-center'>
            <div
              className='relative flex w-full max-w-[430px] flex-col bg-[color:var(--profile-content-bg)] md:mx-auto md:min-h-[min(920px,calc(100dvh-64px))] md:overflow-hidden md:rounded-[30px] md:border md:border-[color:var(--profile-panel-border)] md:shadow-[var(--profile-panel-shadow)]'
              data-testid='profile-compact-shell'
            >
              <div className='pointer-events-none absolute inset-0 bg-[var(--profile-panel-gradient)]' />

              {/* Hero */}
              <header
                className='relative w-full'
                style={{ aspectRatio: '3 / 4' }}
              >
                <div className='absolute inset-0'>
                  <ImageWithFallback
                    src={heroImageUrl ?? artist.image_url}
                    alt={artist.name}
                    fill
                    priority
                    sizes='(max-width: 767px) 100vw, 430px'
                    className='object-cover object-center'
                    fallbackVariant='avatar'
                    fallbackClassName='bg-surface-2'
                  />
                </div>

                {/* Top gradient for branding visibility */}
                <div className='pointer-events-none absolute inset-x-0 top-0 h-[40%] bg-[linear-gradient(to_bottom,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.2)_50%,transparent_100%)]' />
                {/* Bottom gradient for name legibility */}
                <div className='pointer-events-none absolute inset-x-0 bottom-0 h-[60%] bg-[linear-gradient(to_top,var(--profile-stage-bg)_0%,rgba(5,6,8,0.8)_40%,transparent_100%)]' />

                {/* Top bar: jovie brand + menu */}
                <div className='relative z-10 flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),20px)]'>
                  <BrandLogo
                    size={24}
                    tone='white'
                    rounded={false}
                    className='opacity-50 drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]'
                    aria-hidden={false}
                  />

                  {/* Dropdown menu */}
                  <div ref={menuRef} className='relative'>
                    <button
                      type='button'
                      onClick={() => setMenuOpen(prev => !prev)}
                      className='flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/30 text-white/80 backdrop-blur-xl transition-colors hover:bg-black/45'
                      aria-label='More options'
                      aria-expanded={menuOpen}
                      aria-haspopup='menu'
                    >
                      <MoreHorizontal className='h-4 w-4' />
                    </button>

                    {menuOpen ? (
                      <div
                        className='absolute right-0 top-full z-50 mt-2 min-w-[200px] overflow-hidden rounded-2xl border border-white/12 bg-black/80 p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-2xl'
                        role='menu'
                      >
                        <button
                          type='button'
                          role='menuitem'
                          className={menuItemClassName}
                          onClick={handleShare}
                        >
                          <Share2 className='h-4 w-4 text-white/60' />
                          Share Profile
                        </button>

                        <button
                          type='button'
                          role='menuitem'
                          className={menuItemClassName}
                          onClick={() => {
                            setMenuOpen(false);
                            subscribeSectionRef.current?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            });
                          }}
                        >
                          <Bell className='h-4 w-4 text-white/60' />
                          Get Notified
                        </button>

                        {hasContacts ? (
                          <button
                            type='button'
                            role='menuitem'
                            className={menuItemClassName}
                            onClick={() => {
                              setMenuOpen(false);
                              setContactOpen(true);
                            }}
                          >
                            <Mail className='h-4 w-4 text-white/60' />
                            Contact
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Artist name */}
                <div className='absolute inset-x-0 bottom-6 z-10 px-6'>
                  <h1 className='text-[38px] font-[590] leading-[1.05] tracking-[-0.8px] text-white [text-shadow:0_2px_20px_rgba(0,0,0,0.5)]'>
                    {artist.name}
                  </h1>
                </div>
              </header>

              {/* Content: player + subscribe + socials */}
              <div className='relative z-10 flex flex-col gap-4 px-5 pb-[max(env(safe-area-inset-bottom),40px)] pt-5'>
                {/* Latest release / player card */}
                {latestRelease ? (
                  <ProfileFeaturedCard
                    artist={artist}
                    latestRelease={latestRelease}
                    tourDates={tourDates as never}
                    dsps={mergedDSPs}
                  />
                ) : mergedDSPs.length > 0 ? (
                  <button
                    type='button'
                    onClick={handlePlayClick}
                    className='flex items-center gap-3 rounded-xl border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg)] px-3 py-2.5 shadow-[var(--profile-pearl-shadow)] backdrop-blur-xl transition-colors hover:bg-[var(--profile-pearl-bg-hover)]'
                    aria-label={`Listen to ${artist.name}`}
                  >
                    <div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--profile-pearl-bg-active)]'>
                      <Play className='h-5 w-5 fill-current text-primary-token' />
                    </div>
                    <div className='min-w-0 flex-1'>
                      <p className='truncate text-[14px] font-[510] text-primary-token'>
                        Listen
                      </p>
                      <p className='truncate text-[13px] text-secondary-token'>
                        {mergedDSPs.length} platforms
                      </p>
                    </div>
                    <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--profile-pearl-primary-bg)]'>
                      <Play className='h-3.5 w-3.5 fill-current text-[color:var(--profile-pearl-primary-fg)]' />
                    </div>
                  </button>
                ) : null}

                {/* Subscribe */}
                <section
                  ref={subscribeSectionRef}
                  data-testid='compact-subscribe'
                >
                  {subscribeTwoStep ? (
                    <TwoStepNotificationsCTA
                      artist={artist}
                      startExpanded={mode === 'subscribe'}
                    />
                  ) : (
                    <ArtistNotificationsCTA
                      artist={artist}
                      variant='button'
                      autoOpen={mode === 'subscribe'}
                      forceExpanded
                      hideListenFallback
                    />
                  )}
                </section>

                {/* Social icons */}
                {visibleSocialLinks.length > 0 ? (
                  <nav
                    className='flex items-center justify-center gap-6 pt-1'
                    aria-label='Social links'
                  >
                    {visibleSocialLinks.map(link => (
                      <SocialLink
                        key={link.id}
                        link={link}
                        handle={artist.handle}
                        artistName={artist.name}
                      />
                    ))}
                  </nav>
                ) : null}
              </div>
            </div>
          </main>
        </div>

        {/* Listen drawer */}
        {mergedDSPs.length > 0 ? (
          <ListenDrawer
            open={listenOpen}
            onOpenChange={setListenOpen}
            artist={artist}
            dsps={mergedDSPs}
            enableDynamicEngagement={enableDynamicEngagement}
          />
        ) : null}

        {/* Contact drawer */}
        {hasContacts ? (
          <ContactDrawer
            open={contactOpen}
            onOpenChange={setContactOpen}
            artistName={artist.name}
            artistHandle={artist.handle}
            contacts={availableContacts}
            primaryChannel={primaryChannel}
          />
        ) : null}
      </div>
    </ProfileNotificationsContext.Provider>
  );
}
