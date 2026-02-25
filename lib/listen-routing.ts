import { LISTEN_COOKIE } from '@/constants/app';
import { detectPlatformFromUA } from '@/lib/utils';

export type ProviderKind = 'release' | 'artist' | 'playlist' | 'unknown';

export interface ProviderLink {
  key: string;
  url: string;
  targetKind?: ProviderKind;
  source?: 'discog' | 'profile' | 'social' | 'fallback';
  linkId?: string;
  releaseId?: string;
  releaseCode?: string;
  title?: string;
}

export interface DiscographyEntry {
  code: string;
  providers: ProviderLink[];
  defaultProvider?: string | null;
  targetKind?: ProviderKind;
  id?: string;
  title?: string;
}

export interface ListenProfile {
  id: string;
  username: string;
  spotifyUrl?: string | null;
  appleMusicUrl?: string | null;
  youtubeUrl?: string | null;
  spotifyId?: string | null;
  settings?: Record<string, unknown> | null;
  socialLinks?: Array<{
    id: string;
    platform: string;
    platformType?: string | null;
    url: string;
    isActive?: boolean | null;
  }>;
}

const PROVIDER_ALIASES: Record<string, string> = {
  apple: 'apple_music',
  applemusic: 'apple_music',
  'apple-music': 'apple_music',
  'apple music': 'apple_music',
  youtube: 'youtube',
  youtubemusic: 'youtube_music',
  'youtube-music': 'youtube_music',
  'youtube music': 'youtube_music',
  'you tube': 'youtube',
  soundcloud: 'soundcloud',
  'sound-cloud': 'soundcloud',
  amazon: 'amazon_music',
  'amazon-music': 'amazon_music',
  'amazon music': 'amazon_music',
  tidal: 'tidal',
  deezer: 'deezer',
  spotify: 'spotify',
};

const DSP_KEYS = new Set<string>([
  'spotify',
  'apple_music',
  'youtube',
  'youtube_music',
  'soundcloud',
  'deezer',
  'tidal',
  'bandcamp',
  'amazon_music',
  'pandora',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSupportedUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.trim().length === 0) return false;
  try {
    // Allow custom schemes (spotify://) and http(s)
    new URL(url);
    return true;
  } catch {
    // Fallback: accept scheme-like URLs such as spotify:track:123
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url);
  }
}

export function normalizeProviderKey(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  const alias = PROVIDER_ALIASES[trimmed.replace(/\s+/g, ' ')];
  const normalized = alias ?? trimmed.replace(/[^a-z0-9]+/g, '_');
  return normalized.replace(/^_+|_+$/g, '') || null;
}

function normalizeProviderKind(
  value?: string | null
): ProviderKind | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (
    normalized === 'release' ||
    normalized === 'artist' ||
    normalized === 'playlist'
  ) {
    return normalized;
  }
  return 'unknown';
}

export function extractDiscographyEntries(
  settings: Record<string, unknown> | null | undefined
): DiscographyEntry[] {
  if (!settings || !isRecord(settings)) return [];

  const containers = [
    settings.discog,
    settings.discography,
    settings.listen,
    settings.listenLinks,
    settings.releases,
    settings.music,
    isRecord(settings.listen)
      ? (settings.listen as Record<string, unknown>).entries
      : null,
  ].filter(Boolean);

  const entries: DiscographyEntry[] = [];

  const pushEntry = (raw: unknown) => {
    if (!isRecord(raw)) return;
    const codeSource =
      typeof raw.code === 'string'
        ? raw.code
        : typeof raw.slug === 'string'
          ? raw.slug
          : typeof raw.id === 'string'
            ? raw.id
            : null;
    if (!codeSource) return;

    const providersRaw =
      raw.providers ?? raw.links ?? raw.dsps ?? raw.urls ?? raw.platforms ?? [];

    const providers: ProviderLink[] = [];
    if (Array.isArray(providersRaw)) {
      providersRaw.forEach(item => {
        if (!isRecord(item)) return;
        const key = normalizeProviderKey(
          (item.provider as string | undefined) ??
            (item.key as string | undefined)
        );
        if (!key || !isSupportedUrl(item.url)) return;
        providers.push({
          key,
          url: item.url as string,
          targetKind: normalizeProviderKind(
            item.targetKind as string | undefined
          ),
          source: 'discog',
          linkId: typeof item.linkId === 'string' ? item.linkId : undefined,
          releaseId:
            typeof item.releaseId === 'string' ? item.releaseId : undefined,
          releaseCode: codeSource,
          title: typeof item.title === 'string' ? item.title : undefined,
        });
      });
    } else if (isRecord(providersRaw)) {
      Object.entries(providersRaw).forEach(([providerKey, value]) => {
        if (!isSupportedUrl(value)) return;
        const normalizedKey = normalizeProviderKey(providerKey);
        if (!normalizedKey) return;
        providers.push({
          key: normalizedKey,
          url: value as string,
          targetKind: normalizeProviderKind(
            raw.targetKind as string | undefined
          ),
          source: 'discog',
          releaseCode: codeSource,
          title: typeof raw.title === 'string' ? raw.title : undefined,
        });
      });
    }

    if (providers.length === 0) return;

    entries.push({
      code: codeSource,
      providers,
      defaultProvider:
        typeof raw.defaultProvider === 'string'
          ? raw.defaultProvider
          : typeof raw.preferredProvider === 'string'
            ? raw.preferredProvider
            : undefined,
      targetKind: normalizeProviderKind(raw.targetKind as string | undefined),
      id: typeof raw.id === 'string' ? raw.id : undefined,
      title: typeof raw.title === 'string' ? raw.title : undefined,
    });
  };

  containers.forEach(container => {
    if (Array.isArray(container)) {
      container.forEach(pushEntry);
    } else if (isRecord(container) && Array.isArray(container.entries)) {
      container.entries.forEach(pushEntry);
    }
  });

  return entries;
}

export function findDiscographyEntry(
  settings: Record<string, unknown> | null | undefined,
  code: string
): DiscographyEntry | null {
  const normalizedCode = code.toLowerCase();
  const entries = extractDiscographyEntries(settings);
  return (
    entries.find(entry => entry.code.toLowerCase() === normalizedCode) || null
  );
}

function candidateFromProfile(
  profile: ListenProfile,
  key: string,
  url: string
): ProviderLink {
  return {
    key,
    url,
    targetKind: 'artist',
    source: 'profile',
  };
}

export function buildProviderCandidates(
  profile: ListenProfile,
  options: { entry?: DiscographyEntry | null; releaseCode?: string } = {}
): ProviderLink[] {
  const candidates = new Map<string, ProviderLink>();
  const { entry, releaseCode } = options;

  const addCandidate = (candidate: ProviderLink) => {
    const normalizedKey = normalizeProviderKey(candidate.key);
    if (!normalizedKey) return;
    if (!isSupportedUrl(candidate.url)) return;
    if (candidates.has(normalizedKey)) return;
    candidates.set(normalizedKey, {
      ...candidate,
      key: normalizedKey,
      targetKind: candidate.targetKind ?? 'artist',
    });
  };

  entry?.providers.forEach(provider => addCandidate(provider));

  profile.socialLinks?.forEach(link => {
    if (link.isActive === false) return;
    const platformSource =
      link.platformType && link.platformType !== 'dsp'
        ? link.platformType
        : link.platform;
    const key = normalizeProviderKey(platformSource);
    if (!key || !DSP_KEYS.has(key)) return;
    addCandidate({
      key,
      url: link.url,
      targetKind: 'artist',
      source: 'social',
      linkId: link.id,
      releaseCode,
    });
  });

  if (profile.spotifyUrl) {
    addCandidate(candidateFromProfile(profile, 'spotify', profile.spotifyUrl));
  } else if (profile.spotifyId) {
    addCandidate(
      candidateFromProfile(
        profile,
        'spotify',
        `https://open.spotify.com/artist/${profile.spotifyId}`
      )
    );
  }

  if (profile.appleMusicUrl) {
    addCandidate(
      candidateFromProfile(profile, 'apple_music', profile.appleMusicUrl)
    );
  }

  if (profile.youtubeUrl) {
    addCandidate(candidateFromProfile(profile, 'youtube', profile.youtubeUrl));
  }

  return Array.from(candidates.values());
}

export function extractCreatorDefaultProvider(
  settings: Record<string, unknown> | null | undefined,
  entry?: DiscographyEntry | null
): string | null {
  if (!settings || !isRecord(settings)) {
    return normalizeProviderKey(entry?.defaultProvider) ?? null;
  }

  const candidates: Array<string | null | undefined> = [
    entry?.defaultProvider,
    settings.defaultProvider as string | undefined,
    settings.default_dsp as string | undefined,
    settings.preferredDSP as string | undefined,
    settings.preferredDsp as string | undefined,
    settings.preferredProvider as string | undefined,
    isRecord(settings.listen) &&
    typeof settings.listen.defaultProvider === 'string'
      ? (settings.listen.defaultProvider as string)
      : undefined,
  ];

  const resolved = candidates.find(
    value => typeof value === 'string' && value.trim()
  );
  return normalizeProviderKey(resolved ?? null);
}

function preferenceOrderForPlatform(platform: string | null): string[] {
  switch (platform) {
    case 'ios':
      return ['apple_music', 'spotify', 'youtube', 'soundcloud'];
    case 'android':
      return ['spotify', 'youtube', 'apple_music', 'soundcloud'];
    default:
      return ['spotify', 'apple_music', 'youtube', 'soundcloud'];
  }
}

export interface ProviderSelection {
  provider: ProviderLink | null;
  forcedProviderKey: string | null;
}

export function selectProvider(
  providers: ProviderLink[],
  options: {
    forcedProvider?: string | null;
    creatorDefault?: string | null;
    cookieProvider?: string | null;
    userAgent?: string | null;
  }
): ProviderSelection {
  if (providers.length === 0) {
    return { provider: null, forcedProviderKey: null };
  }

  const forcedProviderKey = normalizeProviderKey(options.forcedProvider);
  const creatorDefaultKey = normalizeProviderKey(options.creatorDefault);
  const cookieKey = normalizeProviderKey(options.cookieProvider);
  const platform = detectPlatformFromUA(options.userAgent || undefined);

  const lookup = (key: string | null) =>
    key ? (providers.find(provider => provider.key === key) ?? null) : null;

  const forced = lookup(forcedProviderKey);
  if (forced) {
    return { provider: forced, forcedProviderKey };
  }

  const creatorPreferred = lookup(creatorDefaultKey);
  if (creatorPreferred) {
    return { provider: creatorPreferred, forcedProviderKey };
  }

  const cookiePreferred = lookup(cookieKey);
  if (cookiePreferred) {
    return { provider: cookiePreferred, forcedProviderKey };
  }

  const platformPreferred = preferenceOrderForPlatform(platform)
    .map(lookup)
    .find(Boolean);
  if (platformPreferred) {
    return { provider: platformPreferred, forcedProviderKey };
  }

  return { provider: providers[0] ?? null, forcedProviderKey };
}

export function getCookieProvider(request: {
  cookies: { get: (key: string) => { value?: string } | undefined };
}): string | null {
  const cookieValue = request.cookies.get(LISTEN_COOKIE)?.value;
  return normalizeProviderKey(cookieValue);
}
