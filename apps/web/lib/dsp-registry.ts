/**
 * DSP Registry — Single Source of Truth
 *
 * Every DSP/service definition lives here. All other files derive their
 * lists, mappings, and configs from this registry. Adding a new DSP means
 * adding one entry here — nothing else.
 *
 * ┌─────────────────────────────────┐
 * │        DSP_REGISTRY (40)        │
 * └──────────┬──────────────────────┘
 *            │ derives
 *      ┌─────┴─────┬──────────┬────────────┬──────────────┐
 *      ▼           ▼          ▼            ▼              ▼
 *  DSP_CONFIGS  ProviderKey  SERVICE_TO   PROVIDER_    PLATFORM_TO
 *  (visual)     (type)       _PROVIDER    DOMAINS      _DSP_MAPPINGS
 */

// ============================================================================
// Types
// ============================================================================

export type DspCategory = 'streaming' | 'video' | 'metadata' | 'social';

export interface DspRegistryEntry {
  /** Internal key (snake_case). Used as ProviderKey throughout the app. */
  key: string;
  /** Human-readable display name. */
  name: string;
  /** MusicFetch API service name (camelCase, as their API expects). */
  musicfetchService: string;
  /** Brand color hex. */
  color: string;
  /** Text color on brand background. */
  textColor: string;
  /** SVG icon string. */
  logoSvg: string;
  /** Valid URL domains for link validation. */
  domains: string[];
  /** Search URL template. Use `{query}` as placeholder. null = no search URL. */
  searchUrlTemplate: string | null;
  /**
   * Category determines how this service is treated:
   * - streaming: shown on listen page, stored as DSP social link
   * - video: for "Use This Sound" feature (tiktok, instagram, youtubeShorts)
   * - metadata: stored but not shown on listen page or as social links (genius, discogs)
   * - social: social profile links (currently unused — instagram/tiktok are categorized as video)
   */
  category: DspCategory;
  /** Whether to show on the fan-facing listen page. True for streaming DSPs only. */
  showOnListenPage: boolean;
  /** Additional keyword aliases for platform name matching (e.g. 'itunes' for apple_music). */
  aliases: string[];
}

export interface DSPConfig {
  name: string;
  color: string;
  textColor: string;
  logoSvg: string;
}

// ============================================================================
// Logo Helpers
// ============================================================================

function buildMonogramLogo(name: string): string {
  const monogram = name
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return `<svg role="img" viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg"><title>${name}</title><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2"/><text x="12" y="15" text-anchor="middle" font-size="8" font-family="system-ui, -apple-system, sans-serif" font-weight="700" fill="currentColor">${monogram}</text></svg>`;
}

// Full SVG logos for major platforms
const SPOTIFY_LOGO = `<svg role="img" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><title>Spotify</title><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.48.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.32 11.28-1.08 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`;
const SOUNDCLOUD_LOGO = `<svg role="img" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><title>SoundCloud</title><path d="M17.7 9.024a3.31 3.31 0 0 0-.515.043 5.59 5.59 0 0 0-5.47-4.498 5.52 5.52 0 0 0-3.27 1.056 4.74 4.74 0 0 0-1.868 3.373c-.037.321-.034.642.009.962a3.69 3.69 0 0 0-1.323-.24 3.65 3.65 0 1 0 0 7.3h12.437a2.69 2.69 0 0 0 0-5.381Z"/></svg>`;
const APPLE_MUSIC_LOGO = `<svg role="img" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><title>Apple Music</title><path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.84 7.088 7.088 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.401-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18v11.498c.012.395.044.788.1 1.18.07.483.17.96.362 1.408.566 1.328 1.53 2.25 2.865 2.78.703.278 1.446.358 2.193.401.152.009.303.016.455.026h12.023c.04-.003.083-.01.124-.013a7.088 7.088 0 001.564-.15 5.022 5.022 0 001.877-.84c1.118-.733 1.863-1.732 2.18-3.043.176-.72.24-1.451.24-2.19V6.124zm-6.282 5.117v4.667c0 .378-.05.748-.2 1.1-.249.578-.682.96-1.296 1.127-.191.052-.39.08-.59.09-.63.03-1.18-.14-1.63-.57-.45-.43-.65-.97-.6-1.59.07-.86.57-1.47 1.37-1.79.32-.13.66-.2 1-.24.38-.04.76-.08 1.14-.15.18-.03.32-.12.38-.31.02-.06.03-.13.03-.2V9.39c0-.13-.05-.22-.18-.26-.07-.02-.15-.03-.22-.04l-4.12-.82c-.17-.03-.28.02-.33.2-.01.05-.02.1-.02.16v6.96c0 .41-.05.81-.22 1.19-.26.59-.7.98-1.33 1.14-.19.05-.39.08-.59.09-.63.03-1.18-.14-1.63-.57-.45-.43-.65-.97-.6-1.59.07-.86.57-1.47 1.37-1.79.32-.13.66-.2 1-.24.38-.04.76-.08 1.14-.15.21-.04.35-.15.39-.37.01-.05.01-.1.01-.15V6.56c0-.2.06-.35.24-.42.05-.02.1-.03.16-.04l5.69-1.13c.2-.04.39-.08.59-.09.27-.02.47.12.52.39.01.06.02.13.02.19v5.78z"/></svg>`;
const YOUTUBE_LOGO = `<svg role="img" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><title>YouTube</title><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;
const YOUTUBE_MUSIC_LOGO = `<svg role="img" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><title>YouTube Music</title><path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228 18.228 15.432 18.228 12 15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z"/></svg>`;

// ============================================================================
// Registry Builder — eliminates repetitive object literals
// ============================================================================

interface DspInput {
  key: string;
  name: string;
  musicfetchService: string;
  color: string;
  domains: string[];
  searchUrlTemplate?: string | null;
  textColor?: string;
  logoSvg?: string;
  category?: DspCategory;
  showOnListenPage?: boolean;
  aliases?: string[];
}

type CompactDspOptions = Pick<DspInput, 'aliases' | 'textColor'>;

type CompactDspInput = readonly [
  key: string,
  name: string,
  musicfetchService: string,
  color: string,
  domains: string[],
  searchUrlTemplate: string | null,
  options?: CompactDspOptions,
];

/** Build a registry entry with sensible defaults for streaming DSPs. */
function dsp(input: DspInput): DspRegistryEntry {
  const category = input.category ?? 'streaming';
  return {
    key: input.key,
    name: input.name,
    musicfetchService: input.musicfetchService,
    color: input.color,
    textColor: input.textColor ?? 'white',
    logoSvg: input.logoSvg ?? buildMonogramLogo(input.name),
    domains: input.domains,
    searchUrlTemplate: input.searchUrlTemplate ?? null,
    category,
    showOnListenPage: input.showOnListenPage ?? category === 'streaming',
    aliases: input.aliases ?? [],
  };
}

function compactDsp([
  key,
  name,
  musicfetchService,
  color,
  domains,
  searchUrlTemplate,
  options,
]: CompactDspInput): DspRegistryEntry {
  return dsp({
    key,
    name,
    musicfetchService,
    color,
    domains,
    searchUrlTemplate,
    ...options,
  });
}

const INTERNATIONAL_STREAMING_DSP_INPUTS: readonly CompactDspInput[] = [
  [
    'amazon',
    'Amazon',
    'amazon',
    '#FF9900',
    ['amazon.com', 'www.amazon.com'],
    'https://www.amazon.com/s?k={query}&i=digital-music',
    { textColor: '#0A0A0A' },
  ],
  [
    'awa',
    'AWA',
    'awa',
    '#FC5B11',
    ['awa.fm', 'www.awa.fm'],
    'https://s.awa.fm/search/{query}',
  ],
  [
    'audius',
    'Audius',
    'audius',
    '#CC0FE0',
    ['audius.co', 'www.audius.co'],
    'https://audius.co/search/{query}',
  ],
  [
    'flo',
    'FLO',
    'flo',
    '#00C3C1',
    ['music-flo.com', 'www.music-flo.com'],
    null,
  ],
  [
    'gaana',
    'Gaana',
    'gaana',
    '#E72C30',
    ['gaana.com', 'www.gaana.com'],
    'https://gaana.com/search/{query}',
  ],
  [
    'jio_saavn',
    'JioSaavn',
    'jioSaavn',
    '#2BC5B4',
    ['jiosaavn.com', 'www.jiosaavn.com', 'saavn.com'],
    'https://www.jiosaavn.com/search/{query}',
    { aliases: ['saavn', 'jiosaavn'] },
  ],
  ['joox', 'JOOX', 'joox', '#00D96F', ['joox.com', 'www.joox.com'], null],
  [
    'kkbox',
    'KKBOX',
    'kkbox',
    '#09CEF6',
    ['kkbox.com', 'www.kkbox.com'],
    'https://www.kkbox.com/search?q={query}',
  ],
  [
    'line_music',
    'LINE MUSIC',
    'lineMusic',
    '#00B900',
    ['music.line.me'],
    null,
    { aliases: ['linemusic'] },
  ],
  [
    'netease',
    'NetEase Music',
    'netEase',
    '#C20C0C',
    ['music.163.com', 'y.music.163.com'],
    null,
    { aliases: ['netease_music', 'neteasemusic'] },
  ],
  [
    'qq_music',
    'QQ Music',
    'qqMusic',
    '#31C27C',
    ['y.qq.com', 'i.y.qq.com'],
    null,
    { aliases: ['qqmusic', 'tencent_music', 'tencentmusic'] },
  ],
  [
    'trebel',
    'Trebel',
    'trebel',
    '#8B5CF6',
    ['trebel.io', 'www.trebel.io'],
    null,
  ],
  [
    'yandex',
    'Yandex Music',
    'yandex',
    '#FFCC00',
    ['music.yandex.ru', 'music.yandex.com'],
    'https://music.yandex.ru/search?text={query}',
    { aliases: ['yandexmusic'], textColor: '#0A0A0A' },
  ],
] as const;

// ============================================================================
// Registry
// ============================================================================

/**
 * The canonical DSP registry. Every service MusicFetch supports is listed here.
 *
 * To add a new DSP:
 * 1. Add an entry here — that's it. All derived lists update automatically.
 */
export const DSP_REGISTRY: readonly DspRegistryEntry[] = [
  // ─── Major Streaming DSPs ──────────────────────────────────────────────
  dsp({
    key: 'spotify',
    name: 'Spotify',
    musicfetchService: 'spotify',
    color: '#1DB954',
    logoSvg: SPOTIFY_LOGO,
    domains: ['open.spotify.com', 'spotify.com', 'spotify.link'],
    searchUrlTemplate: 'https://open.spotify.com/search/{query}',
  }),
  dsp({
    key: 'apple_music',
    name: 'Apple Music',
    musicfetchService: 'appleMusic',
    color: '#FA243C',
    logoSvg: APPLE_MUSIC_LOGO,
    domains: [
      'music.apple.com',
      'itunes.apple.com',
      'geo.music.apple.com',
      'apple.co',
    ],
    searchUrlTemplate:
      'https://music.apple.com/{storefront}/search?term={query}',
    aliases: ['itunes', 'applemusic'],
  }),
  dsp({
    key: 'youtube_music',
    name: 'YouTube Music',
    musicfetchService: 'youtubeMusic',
    color: '#FF0000',
    logoSvg: YOUTUBE_MUSIC_LOGO,
    domains: ['music.youtube.com'],
    searchUrlTemplate: 'https://music.youtube.com/search?q={query}',
    aliases: ['youtubemusic'],
  }),
  dsp({
    key: 'soundcloud',
    name: 'SoundCloud',
    musicfetchService: 'soundCloud',
    color: '#FF5500',
    logoSvg: SOUNDCLOUD_LOGO,
    domains: ['soundcloud.com', 'on.soundcloud.com', 'm.soundcloud.com'],
    searchUrlTemplate: 'https://soundcloud.com/search?q={query}',
  }),
  dsp({
    key: 'deezer',
    name: 'Deezer',
    musicfetchService: 'deezer',
    color: '#2F9AFF',
    domains: ['deezer.com', 'www.deezer.com', 'deezer.page.link'],
    searchUrlTemplate: 'https://www.deezer.com/search/{query}',
  }),
  dsp({
    key: 'tidal',
    name: 'Tidal',
    musicfetchService: 'tidal',
    color: '#111111',
    domains: ['tidal.com', 'listen.tidal.com'],
    searchUrlTemplate: 'https://tidal.com/search?q={query}',
  }),
  dsp({
    key: 'amazon_music',
    name: 'Amazon Music',
    musicfetchService: 'amazonMusic',
    color: '#146EB4',
    domains: ['music.amazon.com'],
    searchUrlTemplate: 'https://music.amazon.com/search/{query}',
    aliases: ['amazonmusic'],
  }),
  dsp({
    key: 'bandcamp',
    name: 'Bandcamp',
    musicfetchService: 'bandcamp',
    color: '#629AA0',
    domains: ['bandcamp.com'],
    searchUrlTemplate: 'https://bandcamp.com/search?q={query}',
  }),

  // ─── Niche / Regional Streaming DSPs ───────────────────────────────────
  dsp({
    key: 'pandora',
    name: 'Pandora',
    musicfetchService: 'pandora',
    color: '#224099',
    domains: ['pandora.com', 'www.pandora.com'],
    searchUrlTemplate: 'https://www.pandora.com/search/{query}/tracks',
  }),
  dsp({
    key: 'napster',
    name: 'Napster',
    musicfetchService: 'napster',
    color: '#2259FF',
    domains: ['web.napster.com', 'napster.com', 'us.napster.com'],
    searchUrlTemplate: 'https://web.napster.com/search?query={query}',
  }),
  dsp({
    key: 'audiomack',
    name: 'Audiomack',
    musicfetchService: 'audiomack',
    color: '#FFA200',
    textColor: '#0A0A0A',
    domains: ['audiomack.com', 'www.audiomack.com'],
    searchUrlTemplate: 'https://audiomack.com/search?q={query}',
  }),
  dsp({
    key: 'qobuz',
    name: 'Qobuz',
    musicfetchService: 'qobuz',
    color: '#0070EF',
    domains: ['qobuz.com', 'www.qobuz.com', 'open.qobuz.com', 'play.qobuz.com'],
    searchUrlTemplate: 'https://www.qobuz.com/search?q={query}',
  }),
  dsp({
    key: 'anghami',
    name: 'Anghami',
    musicfetchService: 'anghami',
    color: '#F300F9',
    domains: ['anghami.com', 'play.anghami.com'],
    searchUrlTemplate: 'https://play.anghami.com/search/{query}',
  }),
  dsp({
    key: 'boomplay',
    name: 'Boomplay',
    musicfetchService: 'boomplay',
    color: '#0052FF',
    domains: ['boomplay.com', 'www.boomplay.com'],
    searchUrlTemplate: 'https://www.boomplay.com/search/default/{query}',
  }),
  dsp({
    key: 'iheartradio',
    name: 'iHeartRadio',
    musicfetchService: 'iHeartRadio',
    color: '#C6002B',
    domains: ['iheart.com', 'www.iheart.com'],
    searchUrlTemplate: 'https://www.iheart.com/search/?query={query}',
  }),
  dsp({
    key: 'beatport',
    name: 'Beatport',
    musicfetchService: 'beatport',
    color: '#A3E422',
    textColor: '#0A0A0A',
    domains: ['beatport.com'],
    searchUrlTemplate: 'https://www.beatport.com/search?q={query}',
  }),

  // ─── New International Streaming DSPs ──────────────────────────────────
  ...INTERNATIONAL_STREAMING_DSP_INPUTS.map(compactDsp),

  // ─── Video / Sound Platforms ───────────────────────────────────────────
  dsp({
    key: 'tiktok',
    name: 'TikTok',
    musicfetchService: 'tiktok',
    color: '#000000',
    domains: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com'],
    searchUrlTemplate: 'https://www.tiktok.com/search?q={query}',
    category: 'video',
    showOnListenPage: false,
  }),
  dsp({
    key: 'instagram',
    name: 'Instagram',
    musicfetchService: 'instagram',
    color: '#E4405F',
    domains: ['instagram.com', 'www.instagram.com'],
    category: 'video',
    showOnListenPage: false,
  }),
  dsp({
    key: 'youtube_shorts',
    name: 'YouTube Shorts',
    musicfetchService: 'youtubeShorts',
    color: '#FF0000',
    logoSvg: YOUTUBE_LOGO,
    domains: ['youtube.com', 'www.youtube.com', 'youtu.be'],
    category: 'video',
    showOnListenPage: false,
  }),

  // ─── YouTube (regular — streaming, shown on listen page) ───────────────
  dsp({
    key: 'youtube',
    name: 'YouTube',
    musicfetchService: 'youtube',
    color: '#FF0000',
    logoSvg: YOUTUBE_LOGO,
    domains: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
    searchUrlTemplate: 'https://music.youtube.com/search?q={query}',
  }),

  // ─── Metadata Services ─────────────────────────────────────────────────
  dsp({
    key: 'genius',
    name: 'Genius',
    musicfetchService: 'genius',
    color: '#FFFF64',
    textColor: '#0A0A0A',
    domains: ['genius.com', 'www.genius.com'],
    category: 'metadata',
  }),
  dsp({
    key: 'discogs',
    name: 'Discogs',
    musicfetchService: 'discogs',
    color: '#333333',
    domains: ['discogs.com', 'www.discogs.com'],
    category: 'metadata',
  }),
  dsp({
    key: 'musicbrainz',
    name: 'MusicBrainz',
    musicfetchService: 'musicBrainz',
    color: '#BA478F',
    domains: ['musicbrainz.org'],
    category: 'metadata',
  }),
  dsp({
    key: 'shazam',
    name: 'Shazam',
    musicfetchService: 'shazam',
    color: '#0088FF',
    domains: ['shazam.com', 'www.shazam.com'],
    category: 'metadata',
  }),
  dsp({
    key: 'seven_digital',
    name: '7digital',
    musicfetchService: 'sevenDigital',
    color: '#FF6600',
    domains: ['7digital.com', 'www.7digital.com'],
    category: 'metadata',
    aliases: ['sevendigital'],
  }),
  dsp({
    key: 'telmor_musik',
    name: 'Telmor Musik',
    musicfetchService: 'telmorMusik',
    color: '#666666',
    domains: [],
    category: 'metadata',
  }),
  dsp({
    key: 'yousee_musik',
    name: 'YouSee Musik',
    musicfetchService: 'youSeeMusik',
    color: '#666666',
    domains: [],
    category: 'metadata',
  }),
] as const;

// ============================================================================
// Derived Exports — all computed from DSP_REGISTRY
// ============================================================================

/** Lookup by key for O(1) access */
const _byKey = new Map<string, DspRegistryEntry>();
for (const entry of DSP_REGISTRY) {
  _byKey.set(entry.key, entry);
}

/** Lookup by MusicFetch service name */
const _byService = new Map<string, DspRegistryEntry>();
for (const entry of DSP_REGISTRY) {
  _byService.set(entry.musicfetchService, entry);
}

/** All MusicFetch service names (for API requests). */
export const MUSICFETCH_ALL_SERVICES: string[] = DSP_REGISTRY.map(
  e => e.musicfetchService
);

/**
 * Streaming DSP keys — shown on the fan-facing listen page.
 * Excludes video, metadata, and social categories.
 */
export const STREAMING_DSP_KEYS: string[] = DSP_REGISTRY.filter(
  e => e.showOnListenPage
).map(e => e.key);

/**
 * Maps MusicFetch camelCase service names → our snake_case keys.
 * Used when processing MusicFetch API responses.
 */
export const SERVICE_TO_PROVIDER: Record<string, string> = Object.fromEntries(
  DSP_REGISTRY.map(e => [e.musicfetchService, e.key])
);

/**
 * DSP visual configs (name, color, textColor, logoSvg) keyed by provider key.
 * Only includes entries that should be rendered as DSP buttons.
 */
export const DSP_CONFIGS: Record<string, DSPConfig> = Object.fromEntries(
  DSP_REGISTRY.filter(e => e.showOnListenPage).map(e => [
    e.key,
    {
      name: e.name,
      color: e.color,
      textColor: e.textColor,
      logoSvg: e.logoSvg,
    },
  ])
);

// Also include soundcloud_release as a special alias for release-context SoundCloud
DSP_CONFIGS['soundcloud_release'] = {
  name: 'SoundCloud',
  color: '#FF5500',
  textColor: 'white',
  logoSvg: SOUNDCLOUD_LOGO,
};

/**
 * Provider domain mapping for URL validation.
 * Only includes entries with domains defined.
 */
export const PROVIDER_DOMAINS: Record<string, string[]> = Object.fromEntries(
  DSP_REGISTRY.filter(e => e.domains.length > 0).map(e => [e.key, e.domains])
);

/**
 * Normalize a platform identifier to its canonical DSP key.
 * Handles: kebab-case, snake_case, camelCase, aliases.
 * Returns null if no match found.
 */
export function normalizePlatformKey(platform: string): string | null {
  if (!platform) return null;
  const normalized = platform.toLowerCase().replaceAll(/[^a-z0-9]/g, '');

  // Direct key match (after stripping separators)
  for (const entry of DSP_REGISTRY) {
    const keyNorm = entry.key.replaceAll('_', '');
    if (keyNorm === normalized) return entry.key;
  }

  // Alias match
  for (const entry of DSP_REGISTRY) {
    for (const alias of entry.aliases) {
      if (alias.replaceAll(/[^a-z0-9]/g, '') === normalized) return entry.key;
    }
  }

  // Substring match for common patterns (e.g. 'youtubemusic' contains 'youtube')
  // Order matters: check longer/more-specific names first
  const orderedEntries = [...DSP_REGISTRY].sort(
    (a, b) => b.key.length - a.key.length
  );
  for (const entry of orderedEntries) {
    const keyNorm = entry.key.replaceAll('_', '');
    if (normalized.includes(keyNorm)) return entry.key;
  }

  return null;
}

/**
 * Keys that are categorized as DSPs for dashboard routing.
 * Excludes regular YouTube (which is shown on listen page but categorized
 * as social for dashboard purposes) and TikTok (social profile, not music DSP).
 */
const DSP_CATEGORIZATION_EXCLUSIONS = new Set(['youtube', 'tiktok']);

/**
 * Check if a platform identifier corresponds to a DSP (streaming platform).
 * Normalizes input before checking.
 *
 * Note: Regular YouTube returns false here (it's social for dashboard routing)
 * even though it appears on the listen page. Use `showOnListenPage` for that.
 */
export function isDspPlatform(platform: string): boolean {
  const key = normalizePlatformKey(platform);
  if (!key) return false;
  if (DSP_CATEGORIZATION_EXCLUSIONS.has(key)) return false;
  const entry = _byKey.get(key);
  return entry?.category === 'streaming';
}

/**
 * Platform-to-DSP keyword mappings for social link resolution.
 * Derived from registry keys + aliases. Used by getCanonicalProfileDSPs().
 */
export const PLATFORM_TO_DSP_MAPPINGS: Array<{
  keywords: string[];
  dspKey: string;
}> = DSP_REGISTRY.filter(e => e.showOnListenPage).map(e => ({
  keywords: [
    e.key.replaceAll('_', ''),
    ...e.aliases.map(a => a.replaceAll(/[^a-z0-9]/g, '')),
  ],
  dspKey: e.key,
}));

/**
 * MusicFetch link mappings for social link extraction during artist enrichment.
 * Maps MusicFetch service keys → platform IDs for social_links table.
 * Only includes streaming DSPs (not metadata/video).
 */
export const MUSICFETCH_LINK_MAPPINGS: Array<{
  serviceKey: string;
  platformId: string;
}> = DSP_REGISTRY.filter(e => e.category === 'streaming').map(e => ({
  serviceKey: e.musicfetchService,
  platformId: e.key,
}));

/**
 * Build a search URL for a DSP using the registry template.
 * Returns null if no template exists for the DSP.
 */
export function buildSearchUrl(
  providerKey: string,
  query: string,
  options: { storefront?: string } = {}
): string | null {
  const entry = _byKey.get(providerKey);
  if (!entry?.searchUrlTemplate) {
    return null;
  }

  return entry.searchUrlTemplate
    .replace('{query}', encodeURIComponent(query))
    .replace('{storefront}', options.storefront ?? 'us');
}

/**
 * Get a registry entry by key.
 */
export function getRegistryEntry(key: string): DspRegistryEntry | undefined {
  return _byKey.get(key);
}

/**
 * Get a registry entry by MusicFetch service name.
 */
export function getRegistryEntryByService(
  service: string
): DspRegistryEntry | undefined {
  return _byService.get(service);
}
