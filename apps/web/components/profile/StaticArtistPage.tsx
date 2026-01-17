import { ArtistPageShell } from '@/components/profile/ArtistPageShell';
import { ArtistNotificationsCTA } from '@/components/profile/artist-notifications-cta';
import { ProfilePrimaryCTA } from '@/components/profile/ProfilePrimaryCTA';
import { StaticListenInterface } from '@/components/profile/StaticListenInterface';
import VenmoTipSelector from '@/components/profile/VenmoTipSelector';
import { type AvailableDSP, DSP_CONFIGS, getAvailableDSPs } from '@/lib/dsp';
import type { PublicContact } from '@/types/contacts';
import { Artist, LegacySocialLink } from '@/types/db';

type PrimaryAction = 'subscribe' | 'listen';

interface StaticArtistPageProps {
  mode: string;
  artist: Artist;
  socialLinks: LegacySocialLink[];
  contacts: PublicContact[];
  subtitle: string;
  showTipButton: boolean;
  showBackButton: boolean;
  showFooter?: boolean;
  autoOpenCapture?: boolean;
  primaryAction?: PrimaryAction;
  spotifyPreferred?: boolean;
  enableDynamicEngagement?: boolean;
}

function renderContent(
  mode: string,
  artist: Artist,
  socialLinks: LegacySocialLink[],
  primaryAction: PrimaryAction,
  enableDynamicEngagement: boolean
) {
  const mapSocialPlatformToDSPKey = (platform: string): string | null => {
    const normalized = platform.toLowerCase().replaceAll(/[^a-z0-9]/g, '');

    // Map of platform keywords to DSP keys
    const platformMappings: Array<{ keywords: string[]; dspKey: string }> = [
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

    for (const { keywords, dspKey } of platformMappings) {
      if (
        keywords.some(
          keyword => normalized.includes(keyword) || normalized === keyword
        )
      ) {
        return dspKey;
      }
    }

    return null;
  };

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
  const mergedDSPs = (() => {
    const byKey = new Map<string, AvailableDSP>();
    [...artistDSPs, ...socialDSPs].forEach(dsp => {
      if (!byKey.has(dsp.key)) byKey.set(dsp.key, dsp);
    });
    return Array.from(byKey.values());
  })();

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

    case 'tip':
      // Extract Venmo link from social links
      const venmoLink =
        socialLinks.find(l => l.platform === 'venmo')?.url || null;
      const extractVenmoUsername = (url: string | null): string | null => {
        if (!url) return null;
        try {
          const u = new URL(url);
          const allowedVenmoHosts = ['venmo.com', 'www.venmo.com'];
          if (allowedVenmoHosts.includes(u.hostname)) {
            const parts = u.pathname.split('/').filter(Boolean);
            if (parts[0] === 'u' && parts[1]) return parts[1];
            if (parts[0]) return parts[0];
          }
          return null;
        } catch {
          return null;
        }
      };

      const venmoUsername = extractVenmoUsername(venmoLink);
      const AMOUNTS = [3, 5, 7];

      return (
        <main className='space-y-4' aria-labelledby='tipping-title'>
          <h1 id='tipping-title' className='sr-only'>
            Tip {artist.name}
          </h1>

          {venmoLink ? (
            <VenmoTipSelector
              venmoLink={venmoLink}
              venmoUsername={venmoUsername ?? undefined}
              amounts={AMOUNTS}
            />
          ) : (
            <div className='text-center'>
              <div className='bg-surface-0 backdrop-blur-lg border border-subtle rounded-2xl p-8 shadow-xl'>
                <p className='text-secondary-token' role='alert'>
                  Venmo tipping is not available for this artist yet.
                </p>
              </div>
            </div>
          )}
        </main>
      );

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
}: StaticArtistPageProps) {
  const isPublicProfileMode = mode === 'profile';
  const resolvedAutoOpenCapture = autoOpenCapture ?? mode === 'profile';

  return (
    <div className='w-full'>
      <ArtistPageShell
        artist={artist}
        socialLinks={socialLinks}
        contacts={contacts}
        subtitle={subtitle}
        showSocialBar={isPublicProfileMode ? false : mode !== 'listen'}
        showTipButton={isPublicProfileMode ? false : showTipButton}
        showBackButton={showBackButton}
        showFooter={showFooter}
        showNotificationButton={true}
        forceNotificationsEnabled={isPublicProfileMode}
      >
        <div>
          {mode === 'profile' ? (
            <div data-testid='primary-cta'>
              <ProfilePrimaryCTA
                artist={artist}
                socialLinks={socialLinks}
                autoOpenCapture={resolvedAutoOpenCapture}
                showCapture
              />
            </div>
          ) : (
            renderContent(
              mode,
              artist,
              socialLinks,
              primaryAction,
              enableDynamicEngagement
            )
          )}
        </div>
      </ArtistPageShell>
    </div>
  );
}
