import { type AvailableDSP, DSP_CONFIGS } from '@/lib/dsp';

interface ProfileDspSource {
  readonly spotify_url?: string | null;
  readonly spotifyUrl?: string | null;
  readonly spotify_id?: string | null;
  readonly spotifyId?: string | null;
  readonly apple_music_url?: string | null;
  readonly appleMusicUrl?: string | null;
  readonly apple_music_id?: string | null;
  readonly appleMusicId?: string | null;
  readonly youtube_url?: string | null;
  readonly youtubeUrl?: string | null;
  readonly youtube_music_id?: string | null;
  readonly youtubeMusicId?: string | null;
  readonly soundcloud_id?: string | null;
  readonly soundcloudId?: string | null;
  readonly deezer_id?: string | null;
  readonly deezerId?: string | null;
  readonly tidal_id?: string | null;
  readonly tidalId?: string | null;
}

interface SocialLinkSource {
  readonly platform?: string | null;
  readonly url?: string | null;
}

const PLATFORM_TO_DSP_MAPPINGS: Array<{ keywords: string[]; dspKey: string }> =
  [
    { keywords: ['spotify'], dspKey: 'spotify' },
    { keywords: ['applemusic', 'itunes'], dspKey: 'apple_music' },
    { keywords: ['youtubemusic'], dspKey: 'youtube_music' },
    { keywords: ['youtube'], dspKey: 'youtube' },
    { keywords: ['soundcloud'], dspKey: 'soundcloud' },
    { keywords: ['bandcamp'], dspKey: 'bandcamp' },
    { keywords: ['tidal'], dspKey: 'tidal' },
    { keywords: ['deezer'], dspKey: 'deezer' },
    { keywords: ['amazonmusic'], dspKey: 'amazon_music' },
    { keywords: ['pandora'], dspKey: 'pandora' },
  ];

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function addDsp(
  dsps: Map<string, AvailableDSP>,
  key: string,
  url: string | null
) {
  if (!url || dsps.has(key)) return;
  const config = DSP_CONFIGS[key];
  if (!config) return;

  dsps.set(key, { key, name: config.name, url, config });
}

function mapPlatformToDSPKey(
  platform: string | null | undefined
): string | null {
  if (!platform) return null;
  const normalized = platform.toLowerCase().replaceAll(/[^a-z0-9]/g, '');

  for (const { keywords, dspKey } of PLATFORM_TO_DSP_MAPPINGS) {
    if (keywords.some(keyword => normalized.includes(keyword))) return dspKey;
  }

  return null;
}

function buildSpotifyArtistUrl(artistId: string): string {
  return `https://open.spotify.com/artist/${artistId}`;
}

function buildAppleMusicArtistUrl(artistId: string): string {
  return `https://music.apple.com/artist/${artistId}`;
}

function buildYoutubeMusicChannelUrl(channelId: string): string {
  return `https://music.youtube.com/channel/${channelId}`;
}

function buildDeezerArtistUrl(artistId: string): string {
  return `https://www.deezer.com/artist/${artistId}`;
}

function buildTidalArtistUrl(artistId: string): string {
  return `https://tidal.com/browse/artist/${artistId}`;
}

function buildSoundcloudArtistUrl(slug: string): string {
  return `https://soundcloud.com/${slug}`;
}

export function getCanonicalProfileDSPs(
  profile: ProfileDspSource,
  socialLinks: readonly SocialLinkSource[] = []
): AvailableDSP[] {
  const dsps = new Map<string, AvailableDSP>();

  addDsp(
    dsps,
    'spotify',
    readString(profile.spotify_url) ??
      readString(profile.spotifyUrl) ??
      ((readString(profile.spotify_id) ?? readString(profile.spotifyId))
        ? buildSpotifyArtistUrl(
            (readString(profile.spotify_id) ?? readString(profile.spotifyId))!
          )
        : null)
  );

  addDsp(
    dsps,
    'apple_music',
    readString(profile.apple_music_url) ??
      readString(profile.appleMusicUrl) ??
      ((readString(profile.apple_music_id) ?? readString(profile.appleMusicId))
        ? buildAppleMusicArtistUrl(
            (readString(profile.apple_music_id) ??
              readString(profile.appleMusicId))!
          )
        : null)
  );

  addDsp(
    dsps,
    'youtube',
    readString(profile.youtube_url) ?? readString(profile.youtubeUrl)
  );

  addDsp(
    dsps,
    'youtube_music',
    (readString(profile.youtube_music_id) ?? readString(profile.youtubeMusicId))
      ? buildYoutubeMusicChannelUrl(
          (readString(profile.youtube_music_id) ??
            readString(profile.youtubeMusicId))!
        )
      : null
  );

  addDsp(
    dsps,
    'soundcloud',
    (readString(profile.soundcloud_id) ?? readString(profile.soundcloudId))
      ? buildSoundcloudArtistUrl(
          (readString(profile.soundcloud_id) ??
            readString(profile.soundcloudId))!
        )
      : null
  );
  addDsp(
    dsps,
    'deezer',
    (readString(profile.deezer_id) ?? readString(profile.deezerId))
      ? buildDeezerArtistUrl(
          (readString(profile.deezer_id) ?? readString(profile.deezerId))!
        )
      : null
  );
  addDsp(
    dsps,
    'tidal',
    (readString(profile.tidal_id) ?? readString(profile.tidalId))
      ? buildTidalArtistUrl(
          (readString(profile.tidal_id) ?? readString(profile.tidalId))!
        )
      : null
  );

  for (const link of socialLinks) {
    const key = mapPlatformToDSPKey(link.platform);
    addDsp(dsps, key ?? '', readString(link.url));
  }

  return Array.from(dsps.values());
}

export function toDSPPreferences(dsps: readonly AvailableDSP[]) {
  return dsps.map(dsp => ({
    key: dsp.key,
    label: DSP_CONFIGS[dsp.key]?.name ?? dsp.name,
  }));
}
