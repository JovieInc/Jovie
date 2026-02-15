import { Suspense } from 'react';
import { ArtistPageShell } from '@/components/profile/ArtistPageShell';
import { ArtistNotificationsCTA } from '@/components/profile/artist-notifications-cta';
import { LatestReleaseCard } from '@/components/profile/LatestReleaseCard';
import { ProfilePrimaryCTA } from '@/components/profile/ProfilePrimaryCTA';
import { StaticListenInterface } from '@/components/profile/StaticListenInterface';
import { SubscriptionConfirmedBanner } from '@/components/profile/SubscriptionConfirmedBanner';
import VenmoTipSelector from '@/components/profile/VenmoTipSelector';
import type { DiscogRelease } from '@/lib/db/schema/content';
import { type AvailableDSP, DSP_CONFIGS, getAvailableDSPs } from '@/lib/dsp';
import type { AvatarSize } from '@/lib/utils/avatar-sizes';
import type { PublicContact } from '@/types/contacts';
import { Artist, LegacySocialLink } from '@/types/db';

type PrimaryAction = 'subscribe' | 'listen';

// Platform keyword to DSP key mappings
const PLATFORM_TO_DSP_MAPPINGS: Array<{ keywords: string[]; dspKey: string }> =
  [
    { keywords: ['spotify'], dspKey: 'spotify' },
    { keywords: ['applemusic', 'itunes'], dspKey: 'apple_music' },
    { keywords: ['youtube'], dspKey: 'youtube' },
    { keywords: ['soundcloud'], dspKey: 'soundcloud' },
    { keywords: ['bandcamp'], dspKey: 'bandcamp' },
    { keywords: ['tidal'], dspKey: 'tidal' },
    { keywords: ['deezer'], dspKey: 'deezer' },
    { keywords: ['amazonmusic'], dspKey: 'amazon_music' },
    { keywords: ['pandora'], dspKey: 'pandora' },
  ];

const TIP_AMOUNTS = [3, 5, 7];
const ALLOWED_VENMO_HOSTS = new Set(['venmo.com', 'www.venmo.com']);

function mapSocialPlatformToDSPKey(
  platform: string | undefined
): string | null {
  if (typeof platform !== 'string' || !platform) {
    return null;
  }
  const normalized = platform.toLowerCase().replaceAll(/[^a-z0-9]/g, '');

  for (const { keywords, dspKey } of PLATFORM_TO_DSP_MAPPINGS) {
    if (
      keywords.some(
        keyword => normalized.includes(keyword) || normalized === keyword
      )
    ) {
      return dspKey;
    }
  }

  return null;
}

function extractVenmoUsername(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (ALLOWED_VENMO_HOSTS.has(u.hostname)) {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === 'u' && parts[1]) return parts[1];
      if (parts[0]) return parts[0];
    }
    return null;
  } catch {
    return null;
  }
}

interface StaticArtistPageProps {
  readonly mode: string;
  readonly artist: Artist;
  readonly socialLinks: LegacySocialLink[];
  readonly contacts: PublicContact[];
  readonly subtitle: string;
  readonly showTipButton: boolean;
  readonly showBackButton: boolean;
  readonly showFooter?: boolean;
  readonly autoOpenCapture?: boolean;
  readonly primaryAction?: PrimaryAction;
  readonly enableDynamicEngagement?: boolean;
  readonly latestRelease?: DiscogRelease | null;
  /** Available download sizes for profile photo */
  readonly photoDownloadSizes?: AvatarSize[];
  /** Whether profile photo downloads are allowed */
  readonly allowPhotoDownloads?: boolean;
}

/**
 * Merge artist-level DSPs with social-link-derived DSPs, deduped by key.
 * Artist DSPs take priority (listed first).
 */
function getMergedDSPs(
  artist: Artist,
  socialLinks: LegacySocialLink[]
): AvailableDSP[] {
  const socialDSPs: AvailableDSP[] = (() => {
    const mapped = socialLinks
      .filter(link => link.url)
      .map(link => {
        const dspKey = mapSocialPlatformToDSPKey(link.platform);
        if (!dspKey) return null;
        const config = DSP_CONFIGS[dspKey] ?? {
          name: dspKey,
          color: '#0f111a',
          textColor: '#ffffff',
          logoSvg: '',
        };
        return {
          key: dspKey,
          name: config.name,
          url: link.url,
          config,
        } satisfies AvailableDSP;
      })
      .filter(Boolean) as AvailableDSP[];

    const deduped = new Map<string, AvailableDSP>();
    mapped.forEach(item => {
      if (!deduped.has(item.key)) {
        deduped.set(item.key, item);
      }
    });
    return Array.from(deduped.values());
  })();

  const artistDSPs = getAvailableDSPs(artist);
  const byKey = new Map<string, AvailableDSP>();
  [...artistDSPs, ...socialDSPs].forEach(dsp => {
    if (!byKey.has(dsp.key)) byKey.set(dsp.key, dsp);
  });
  return Array.from(byKey.values());
}

function renderContent(
  mode: string,
  artist: Artist,
  socialLinks: LegacySocialLink[],
  mergedDSPs: AvailableDSP[],
  primaryAction: PrimaryAction,
  enableDynamicEngagement: boolean
) {
  switch (mode) {
    case 'listen':
      return (
        <div className='flex justify-center'>
          <StaticListenInterface
            artist={artist}
            handle={artist.handle}
            dspsOverride={mergedDSPs}
            enableDynamicEngagement={enableDynamicEngagement}
          />
        </div>
      );

    case 'tip': {
      const venmoLink =
        socialLinks.find(l => l.platform === 'venmo')?.url || null;
      const venmoUsername = extractVenmoUsername(venmoLink);

      return (
        <main className='space-y-4' aria-labelledby='tipping-title'>
          <h1 id='tipping-title' className='sr-only'>
            Tip {artist.name}
          </h1>

          {venmoLink ? (
            <VenmoTipSelector
              venmoLink={venmoLink}
              venmoUsername={venmoUsername ?? undefined}
              amounts={TIP_AMOUNTS}
            />
          ) : (
            <div className='text-center'>
              <div className='rounded-2xl border border-subtle bg-surface-1 p-6 shadow-sm'>
                <p className='text-sm text-secondary-token' role='alert'>
                  Venmo tipping is not available for this artist yet.
                </p>
              </div>
            </div>
          )}
        </main>
      );
    }

    case 'subscribe':
      // Subscribe mode - show notification subscription form directly
      return (
        <div className='space-y-4 py-4 sm:py-5'>
          <ArtistNotificationsCTA artist={artist} variant='button' autoOpen />
        </div>
      );

    default: // 'profile' mode
      // spotifyPreferred is now read client-side in ProfilePrimaryCTA
      return (
        <div className='space-y-4'>
          <ProfilePrimaryCTA artist={artist} socialLinks={socialLinks} />
        </div>
      );
  }
}

// Static version without animations for immediate rendering
// NOTE: spotifyPreferred is now read client-side via cookie in ProfilePrimaryCTA
export function StaticArtistPage({
  mode,
  artist,
  socialLinks,
  contacts,
  subtitle,
  showTipButton,
  showBackButton,
  showFooter = true,
  autoOpenCapture,
  primaryAction = 'subscribe',
  enableDynamicEngagement = false,
  latestRelease,
  photoDownloadSizes = [],
  allowPhotoDownloads = false,
}: StaticArtistPageProps) {
  const resolvedAutoOpenCapture = autoOpenCapture ?? mode === 'profile';
  const mergedDSPs = getMergedDSPs(artist, socialLinks);

  return (
    <div className='w-full'>
      <ArtistPageShell
        artist={artist}
        socialLinks={socialLinks}
        contacts={contacts}
        subtitle={subtitle}
        showSocialBar={mode !== 'listen'}
        showTipButton={showTipButton}
        showBackButton={showBackButton}
        showFooter={showFooter}
        showNotificationButton={true}
        photoDownloadSizes={photoDownloadSizes}
        allowPhotoDownloads={allowPhotoDownloads}
      >
        <div>
          <Suspense>
            <SubscriptionConfirmedBanner />
          </Suspense>
          {mode === 'profile' ? (
            <div className='space-y-4'>
              {latestRelease && (
                <LatestReleaseCard
                  release={latestRelease}
                  artistHandle={artist.handle}
                  artist={artist}
                  dsps={mergedDSPs}
                  enableDynamicEngagement={enableDynamicEngagement}
                />
              )}
              <div data-testid='primary-cta'>
                <ProfilePrimaryCTA
                  artist={artist}
                  socialLinks={socialLinks}
                  mergedDSPs={mergedDSPs}
                  enableDynamicEngagement={enableDynamicEngagement}
                  autoOpenCapture={resolvedAutoOpenCapture}
                  showCapture
                />
              </div>
            </div>
          ) : (
            renderContent(
              mode,
              artist,
              socialLinks,
              mergedDSPs,
              primaryAction,
              enableDynamicEngagement
            )
          )}
        </div>
      </ArtistPageShell>
    </div>
  );
}
