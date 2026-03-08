'use client';

import { Calendar, ExternalLink, MapPin } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { VerifiedBadge } from '@/components/atoms/VerifiedBadge';
import { ListenDrawer } from '@/components/profile/ListenDrawer';
import { COUNTRY_CODE_COOKIE, LISTEN_COOKIE } from '@/constants/app';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { track } from '@/lib/analytics';
import type { DiscogRelease } from '@/lib/db/schema/content';
import {
  type AvailableDSP,
  DSP_CONFIGS,
  getAvailableDSPs,
  sortDSPsForDevice,
} from '@/lib/dsp';
import { detectPlatformFromUA } from '@/lib/utils';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';

// Social platforms to display (exclude DSP/venmo/other non-social)
const SOCIAL_PLATFORMS = new Set([
  'instagram',
  'twitter',
  'x',
  'tiktok',
  'youtube',
  'facebook',
  'threads',
  'bluesky',
  'mastodon',
  'snapchat',
  'twitch',
  'discord',
  'reddit',
  'linkedin',
]);

const PLATFORM_TO_DSP: Record<string, string> = {
  spotify: 'spotify',
  applemusic: 'apple_music',
  youtubemusic: 'youtube_music',
  soundcloud: 'soundcloud',
  bandcamp: 'bandcamp',
  tidal: 'tidal',
  deezer: 'deezer',
  amazonmusic: 'amazon_music',
  pandora: 'pandora',
};

function mapSocialToDSP(platform: string): string | null {
  const norm = platform.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
  for (const [key, dsp] of Object.entries(PLATFORM_TO_DSP)) {
    if (norm.includes(key)) return dsp;
  }
  return null;
}

function getMergedDSPs(
  artist: Artist,
  socialLinks: LegacySocialLink[]
): AvailableDSP[] {
  const byKey = new Map<string, AvailableDSP>();
  for (const dsp of getAvailableDSPs(artist)) {
    byKey.set(dsp.key, dsp);
  }
  for (const link of socialLinks) {
    if (!link.url) continue;
    const dspKey = mapSocialToDSP(link.platform);
    if (!dspKey || byKey.has(dspKey)) continue;
    const config = DSP_CONFIGS[dspKey];
    if (!config) continue;
    byKey.set(dspKey, {
      key: dspKey,
      name: config.name,
      url: link.url,
      config,
    });
  }
  return Array.from(byKey.values());
}

interface ProfileV2ClientProps {
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly genres: string[] | null;
  readonly latestRelease: DiscogRelease | null;
}

export function ProfileV2Client({
  artist,
  socialLinks,
  contacts,
  genres,
  latestRelease,
}: ProfileV2ClientProps) {
  const isMobile = useBreakpointDown('md');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedDSP, setSelectedDSP] = useState<string | null>(null);

  const socialNetworkLinks = useMemo(
    () =>
      socialLinks.filter(l => SOCIAL_PLATFORMS.has(l.platform.toLowerCase())),
    [socialLinks]
  );

  const mergedDSPs = useMemo(
    () => getMergedDSPs(artist, socialLinks),
    [artist, socialLinks]
  );

  const sortedDSPs = useMemo(() => {
    const countryCode =
      typeof document === 'undefined'
        ? null
        : (document.cookie
            .split(';')
            .find(c => c.trim().startsWith(`${COUNTRY_CODE_COOKIE}=`))
            ?.split('=')[1] ?? null);

    const ua =
      typeof navigator === 'undefined' ? undefined : navigator.userAgent;
    const detected = detectPlatformFromUA(ua);
    const platform =
      detected === 'ios' || detected === 'android' ? detected : 'desktop';

    return sortDSPsForDevice(mergedDSPs, {
      countryCode,
      platform,
      enableDevicePriority: false,
    });
  }, [mergedDSPs]);

  const handleDSPClick = async (dsp: AvailableDSP) => {
    if (selectedDSP) return;
    setSelectedDSP(dsp.key);

    document.cookie = `${LISTEN_COOKIE}=${dsp.key}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;

    track('listen_click', {
      handle: artist.handle,
      linkType: 'listen',
      platform: dsp.key,
    });

    try {
      const { getDSPDeepLinkConfig, openDeepLink } = await import(
        '@/lib/deep-links'
      );
      const config = getDSPDeepLinkConfig(dsp.key);
      if (config) {
        await openDeepLink(dsp.url, config);
      } else {
        globalThis.open(dsp.url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      globalThis.open(dsp.url, '_blank', 'noopener,noreferrer');
    } finally {
      setTimeout(() => setSelectedDSP(null), 1000);
    }
  };

  const hasBio = Boolean(artist.tagline);
  const hasLocation = Boolean(artist.location);
  const hasActiveSince = Boolean(artist.active_since_year);
  const hasGenres = genres && genres.length > 0;
  const hasSocials = socialNetworkLinks.length > 0;
  const hasContacts = contacts.length > 0;
  const hasAbout = hasBio || hasLocation || hasActiveSince || hasGenres;

  return (
    <div className='relative min-h-dvh bg-[rgb(8,9,10)] text-[rgb(247,248,248)] antialiased'>
      {/* Subtle radial glow behind hero */}
      <div
        className='pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[800px] opacity-[0.035]'
        style={{
          background:
            'radial-gradient(50% 50% at 50% 30%, rgba(255,255,255,0.8) 0%, transparent 70%)',
        }}
        aria-hidden='true'
      />

      <div className='relative z-10 mx-auto max-w-[420px] px-5 pb-12 pt-10 sm:pt-14'>
        {/* ---- HERO: Avatar + Identity ---- */}
        <header className='flex flex-col items-center text-center'>
          {/* Avatar — tighter, with a subtle luminous ring */}
          <div className='relative mb-5'>
            <div className='size-[120px] sm:size-[140px] rounded-full overflow-hidden ring-1 ring-white/[0.08] shadow-[0_0_40px_rgba(255,255,255,0.03)]'>
              {artist.image_url ? (
                <Image
                  src={artist.image_url}
                  alt={artist.name}
                  width={140}
                  height={140}
                  priority
                  quality={90}
                  className='size-full object-cover'
                />
              ) : (
                <div className='size-full flex items-center justify-center bg-[rgb(22,23,24)] text-[28px] font-[510] text-[rgb(148,149,151)]'>
                  {artist.name
                    .split(' ')
                    .map(w => w[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
              )}
            </div>
          </div>

          {/* Name + verified */}
          <h1 className='flex items-center gap-1.5 text-[22px] sm:text-[26px] font-[590] tracking-[-0.022em] leading-tight'>
            <span>{artist.name}</span>
            {artist.is_verified && (
              <VerifiedBadge size='sm' className='text-accent' />
            )}
          </h1>

          {/* Bio as subtitle — compact, max 2 lines */}
          {hasBio && (
            <p className='mt-2 max-w-[340px] text-[14px] leading-[1.5] text-[rgb(148,149,151)] line-clamp-2'>
              {artist.tagline}
            </p>
          )}

          {/* Location + active since — inline metadata */}
          {(hasLocation || hasActiveSince) && (
            <div className='mt-2.5 flex items-center gap-3 text-[12px] text-[rgb(98,102,109)]'>
              {hasLocation && (
                <span className='flex items-center gap-1'>
                  <MapPin className='size-3' aria-hidden='true' />
                  {artist.location}
                </span>
              )}
              {hasActiveSince && (
                <span className='flex items-center gap-1'>
                  <Calendar className='size-3' aria-hidden='true' />
                  Since {artist.active_since_year}
                </span>
              )}
            </div>
          )}

          {/* Social icons — compact row right under identity */}
          {hasSocials && (
            <div className='mt-4 flex items-center gap-1'>
              {socialNetworkLinks.map(link => (
                <a
                  key={link.id}
                  href={link.url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='flex size-9 items-center justify-center rounded-full text-[rgb(98,102,109)] transition-colors duration-150 hover:bg-white/[0.04] hover:text-[rgb(208,214,224)]'
                  aria-label={`Follow on ${link.platform}`}
                  onClick={() => {
                    track('social_click', {
                      handle: artist.handle,
                      artist: artist.name,
                      platform: link.platform,
                      url: link.url,
                    });
                  }}
                >
                  <SocialIcon
                    platform={link.platform}
                    className='size-[14px]'
                  />
                </a>
              ))}
            </div>
          )}
        </header>

        {/* ---- LATEST RELEASE ---- */}
        {latestRelease && (
          <section className='mt-7' aria-label='Latest release'>
            <div className='flex items-center gap-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 backdrop-blur-sm'>
              <div className='relative size-14 shrink-0 overflow-hidden rounded-lg bg-white/[0.04]'>
                <ImageWithFallback
                  src={latestRelease.artworkUrl}
                  alt={`${latestRelease.title} artwork`}
                  fill
                  sizes='56px'
                  className='object-cover'
                  fallbackVariant='release'
                />
              </div>
              <div className='min-w-0 flex-1'>
                <p className='truncate text-[14px] font-[510] leading-tight'>
                  {latestRelease.title}
                </p>
                <p className='mt-0.5 text-[12px] text-[rgb(98,102,109)]'>
                  {latestRelease.releaseType === 'ep'
                    ? 'EP'
                    : latestRelease.releaseType.charAt(0).toUpperCase() +
                      latestRelease.releaseType.slice(1)}
                  {latestRelease.releaseDate &&
                    ` \u00b7 ${new Date(latestRelease.releaseDate).getFullYear()}`}
                </p>
              </div>
              {isMobile && mergedDSPs.length > 0 ? (
                <button
                  type='button'
                  onClick={() => setDrawerOpen(true)}
                  className='shrink-0 rounded-full bg-white px-4 py-1.5 text-[13px] font-[510] text-[rgb(8,9,10)] transition-opacity duration-150 hover:opacity-90 active:scale-[0.97]'
                  aria-label={`Listen to ${latestRelease.title}`}
                >
                  Listen
                </button>
              ) : (
                <Link
                  href={`/${artist.handle}/${latestRelease.slug}`}
                  prefetch={false}
                  className='shrink-0 rounded-full bg-white px-4 py-1.5 text-[13px] font-[510] text-[rgb(8,9,10)] transition-opacity duration-150 hover:opacity-90 active:scale-[0.97]'
                  aria-label={`Listen to ${latestRelease.title}`}
                >
                  Listen
                </Link>
              )}
            </div>
          </section>
        )}

        {/* ---- STREAMING LINKS ---- */}
        {sortedDSPs.length > 0 && (
          <section className='mt-6' aria-label='Streaming links'>
            <h2 className='mb-3 text-[11px] font-[510] uppercase tracking-[0.08em] text-[rgb(98,102,109)]'>
              Listen
            </h2>
            <div className='space-y-2'>
              {sortedDSPs.map(dsp => (
                <button
                  key={dsp.key}
                  type='button'
                  onClick={() => handleDSPClick(dsp)}
                  disabled={selectedDSP === dsp.key}
                  className='group flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left transition-all duration-150 hover:border-white/[0.1] hover:bg-white/[0.04] active:scale-[0.99] disabled:opacity-50 disabled:cursor-wait'
                  aria-label={`Open in ${dsp.name}`}
                >
                  <div
                    className='flex size-8 shrink-0 items-center justify-center rounded-lg'
                    style={{ backgroundColor: dsp.config.color }}
                  >
                    <div
                      className='size-4'
                      style={{ color: dsp.config.textColor }}
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: Trusted SVG from DSP_CONFIGS
                      dangerouslySetInnerHTML={{ __html: dsp.config.logoSvg }}
                    />
                  </div>
                  <span className='flex-1 text-[14px] font-[510]'>
                    {selectedDSP === dsp.key ? 'Opening...' : dsp.name}
                  </span>
                  <ExternalLink
                    className='size-3.5 text-[rgb(98,102,109)] opacity-0 transition-opacity duration-150 group-hover:opacity-100'
                    aria-hidden='true'
                  />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ---- ABOUT ---- */}
        {hasAbout && (
          <section className='mt-8' aria-label='About'>
            <h2 className='mb-3 text-[11px] font-[510] uppercase tracking-[0.08em] text-[rgb(98,102,109)]'>
              About
            </h2>
            <div className='rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden'>
              {hasBio && (
                <div className='px-4 py-4'>
                  <p className='text-[14px] leading-[1.6] text-[rgb(208,214,224)] whitespace-pre-line'>
                    {artist.tagline}
                  </p>
                </div>
              )}
              {hasGenres && (
                <div
                  className={`px-4 pb-4 ${hasBio ? 'border-t border-white/[0.05] pt-3.5' : 'pt-4'}`}
                >
                  <div className='flex flex-wrap gap-1.5'>
                    {genres.map(genre => (
                      <span
                        key={genre}
                        className='rounded-md bg-white/[0.05] border border-white/[0.05] px-2.5 py-1 text-[11px] font-[510] text-[rgb(148,149,151)]'
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ---- CONTACTS ---- */}
        {hasContacts && (
          <section className='mt-8' aria-label='Contact'>
            <h2 className='mb-3 text-[11px] font-[510] uppercase tracking-[0.08em] text-[rgb(98,102,109)]'>
              Contact
            </h2>
            <div className='space-y-2'>
              {contacts.map(contact => (
                <div
                  key={contact.id}
                  className='flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3'
                >
                  <div className='min-w-0'>
                    <p className='text-[13px] font-[510]'>
                      {contact.roleLabel}
                    </p>
                    <p className='mt-0.5 text-[12px] text-[rgb(98,102,109)]'>
                      {contact.territorySummary}
                      {contact.secondaryLabel &&
                        ` \u00b7 ${contact.secondaryLabel}`}
                    </p>
                  </div>
                  <div className='flex gap-1.5'>
                    {contact.channels.map(ch => (
                      <a
                        key={`${contact.id}-${ch.type}`}
                        href={
                          ch.type === 'email'
                            ? `mailto:${atob(ch.encoded)}`
                            : `tel:${atob(ch.encoded)}`
                        }
                        className='flex size-8 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-[rgb(148,149,151)] transition-colors duration-150 hover:bg-white/[0.06] hover:text-white'
                        aria-label={`${ch.type === 'email' ? 'Email' : 'Call'} ${contact.roleLabel}`}
                      >
                        {ch.type === 'email' ? (
                          <svg
                            className='size-3.5'
                            fill='none'
                            viewBox='0 0 24 24'
                            stroke='currentColor'
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              d='M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75'
                            />
                          </svg>
                        ) : (
                          <svg
                            className='size-3.5'
                            fill='none'
                            viewBox='0 0 24 24'
                            stroke='currentColor'
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              d='M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z'
                            />
                          </svg>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ---- FOOTER ---- */}
        <footer className='mt-12 flex flex-col items-center gap-2 text-center'>
          <Link
            href='/'
            className='text-[11px] font-[510] tracking-[0.04em] text-[rgb(62,64,68)] transition-colors duration-150 hover:text-[rgb(98,102,109)]'
          >
            jovie
          </Link>
        </footer>
      </div>

      {/* Mobile listen drawer */}
      {isMobile && mergedDSPs.length > 0 && (
        <ListenDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          artist={artist}
          dsps={mergedDSPs}
        />
      )}
    </div>
  );
}
