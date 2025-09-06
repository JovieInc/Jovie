/**
 * Platform Detection and Link Normalization Service
 * Atomic utility for identifying and normalizing social/music platform links
 */

export interface PlatformInfo {
  id: string;
  name: string;
  category: 'dsp' | 'social' | 'custom'; // DSP = Digital Service Provider (music platforms)
  icon: string; // Simple Icons platform key
  color: string; // Brand color hex
  placeholder: string;
}

export interface DetectedLink {
  platform: PlatformInfo;
  normalizedUrl: string;
  originalUrl: string;
  suggestedTitle: string;
  isValid: boolean;
  error?: string;
}

// Platform configuration registry (using Simple Icons keys)
const PLATFORMS: Record<string, PlatformInfo> = {
  spotify: {
    id: 'spotify',
    name: 'Spotify',
    category: 'dsp',
    icon: 'spotify',
    color: '1DB954',
    placeholder: 'https://open.spotify.com/artist/...',
  },
  'apple-music': {
    id: 'apple-music',
    name: 'Apple Music',
    category: 'dsp',
    icon: 'applemusic',
    color: 'FA2D48',
    placeholder: 'https://music.apple.com/artist/...',
  },
  'youtube-music': {
    id: 'youtube-music',
    name: 'YouTube Music',
    category: 'dsp',
    icon: 'youtube',
    color: 'FF6D00',
    placeholder: 'https://music.youtube.com/channel/...',
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    category: 'social',
    icon: 'instagram',
    color: 'E4405F',
    placeholder: 'https://instagram.com/username',
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    category: 'social',
    icon: 'tiktok',
    color: '000000',
    placeholder: 'https://tiktok.com/@username',
  },
  twitter: {
    id: 'twitter',
    name: 'X (Twitter)',
    category: 'social',
    icon: 'x',
    color: '000000',
    placeholder: 'https://x.com/username',
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    category: 'social',
    icon: 'facebook',
    color: '1877F2',
    placeholder: 'https://facebook.com/username',
  },
  soundcloud: {
    id: 'soundcloud',
    name: 'SoundCloud',
    category: 'dsp',
    icon: 'soundcloud',
    color: 'FF5500',
    placeholder: 'https://soundcloud.com/username',
  },
  bandcamp: {
    id: 'bandcamp',
    name: 'Bandcamp',
    category: 'dsp',
    icon: 'bandcamp',
    color: '629AA0',
    placeholder: 'https://username.bandcamp.com',
  },
  youtube: {
    id: 'youtube',
    name: 'YouTube',
    category: 'social',
    icon: 'youtube',
    color: 'FF0000',
    placeholder: 'https://youtube.com/@username',
  },
  twitch: {
    id: 'twitch',
    name: 'Twitch',
    category: 'social',
    icon: 'twitch',
    color: '9146FF',
    placeholder: 'https://twitch.tv/username',
  },
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    category: 'social',
    icon: 'linkedin',
    color: '0A66C2',
    placeholder: 'https://linkedin.com/in/username',
  },
  venmo: {
    id: 'venmo',
    name: 'Venmo',
    category: 'social',
    icon: 'venmo',
    color: '3D95CE',
    placeholder: 'https://venmo.com/username',
  },
  website: {
    id: 'website',
    name: 'Website',
    category: 'custom',
    icon: 'website',
    color: '6B7280',
    placeholder: 'https://your-website.com',
  },
  // Additional social platforms
  telegram: {
    id: 'telegram',
    name: 'Telegram',
    category: 'social',
    icon: 'telegram',
    color: '26A5E4',
    placeholder: 'https://t.me/username',
  },
  snapchat: {
    id: 'snapchat',
    name: 'Snapchat',
    category: 'social',
    icon: 'snapchat',
    color: 'FFFC00',
    placeholder: 'https://www.snapchat.com/add/username',
  },
  reddit: {
    id: 'reddit',
    name: 'Reddit',
    category: 'social',
    icon: 'reddit',
    color: 'FF4500',
    placeholder: 'https://www.reddit.com/user/username',
  },
  pinterest: {
    id: 'pinterest',
    name: 'Pinterest',
    category: 'social',
    icon: 'pinterest',
    color: 'E60023',
    placeholder: 'https://www.pinterest.com/username',
  },
  onlyfans: {
    id: 'onlyfans',
    name: 'OnlyFans',
    category: 'social',
    icon: 'onlyfans',
    color: '00AFF0',
    placeholder: 'https://onlyfans.com/username',
  },
  quora: {
    id: 'quora',
    name: 'Quora',
    category: 'social',
    icon: 'quora',
    color: 'B92B27',
    placeholder: 'https://www.quora.com/profile/Name',
  },
  threads: {
    id: 'threads',
    name: 'Threads',
    category: 'social',
    icon: 'threads',
    color: '000000',
    placeholder: 'https://www.threads.net/@username',
  },
  discord: {
    id: 'discord',
    name: 'Discord',
    category: 'social',
    icon: 'discord',
    color: '5865F2',
    placeholder: 'https://discord.gg/inviteCode',
  },
  line: {
    id: 'line',
    name: 'LINE',
    category: 'social',
    icon: 'line',
    color: '00C300',
    placeholder: 'https://line.me/R/ti/p/@username',
  },
  viber: {
    id: 'viber',
    name: 'Viber',
    category: 'social',
    icon: 'viber',
    color: '7360F2',
    placeholder: 'https://www.viber.com/username',
  },
  rumble: {
    id: 'rumble',
    name: 'Rumble',
    category: 'social',
    icon: 'rumble',
    color: '85C742',
    placeholder: 'https://rumble.com/c/ChannelName',
  },
};

// Domain pattern matching for platform detection
const DOMAIN_PATTERNS: Array<{ pattern: RegExp; platformId: string }> = [
  // DSP platforms (Digital Service Providers)
  { pattern: /(?:open\.)?spotify\.com/i, platformId: 'spotify' },
  { pattern: /music\.apple\.com/i, platformId: 'apple-music' },
  { pattern: /music\.youtube\.com/i, platformId: 'youtube-music' },
  { pattern: /soundcloud\.com/i, platformId: 'soundcloud' },
  { pattern: /bandcamp\.com/i, platformId: 'bandcamp' },

  // Social platforms (including YouTube for social/channels)
  { pattern: /(?:www\.)?youtube\.com|youtu\.be/i, platformId: 'youtube' },
  { pattern: /(?:www\.)?instagram\.com/i, platformId: 'instagram' },
  { pattern: /(?:www\.)?tiktok\.com/i, platformId: 'tiktok' },
  { pattern: /(?:twitter\.com|x\.com)/i, platformId: 'twitter' },
  { pattern: /(?:www\.)?facebook\.com/i, platformId: 'facebook' },
  { pattern: /(?:www\.)?twitch\.tv/i, platformId: 'twitch' },
  { pattern: /(?:www\.)?linkedin\.com/i, platformId: 'linkedin' },
  { pattern: /(?:www\.)?venmo\.com/i, platformId: 'venmo' },
  { pattern: /(?:www\.)?reddit\.com/i, platformId: 'reddit' },
  { pattern: /(?:www\.)?pinterest\.com/i, platformId: 'pinterest' },
  { pattern: /(?:www\.)?onlyfans\.com/i, platformId: 'onlyfans' },
  { pattern: /(?:www\.)?quora\.com/i, platformId: 'quora' },
  { pattern: /(?:www\.)?threads\.net/i, platformId: 'threads' },
  { pattern: /(?:discord\.gg|(?:www\.)?discord\.com)/i, platformId: 'discord' },
  { pattern: /(?:t\.me|telegram\.me)/i, platformId: 'telegram' },
  { pattern: /(?:www\.)?snapchat\.com/i, platformId: 'snapchat' },
  { pattern: /(?:www\.)?line\.me/i, platformId: 'line' },
  { pattern: /(?:www\.)?viber\.com/i, platformId: 'viber' },
  { pattern: /(?:www\.)?rumble\.com/i, platformId: 'rumble' },
];

/**
 * Normalize a URL by cleaning UTM parameters and enforcing HTTPS
 */
export function normalizeUrl(url: string): string {
  try {
    // Support bare X (Twitter) handles like @username
    if (/^@[a-zA-Z0-9._]+$/.test(url)) {
      return `https://x.com/${url.slice(1)}`;
    }
    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const parsedUrl = new URL(url);

    // Force HTTPS for known platforms
    parsedUrl.protocol = 'https:';

    // Canonicalize Twitter domain to x.com
    if (/^(?:www\.)?twitter\.com$/i.test(parsedUrl.hostname)) {
      parsedUrl.hostname = 'x.com';
    }

    // Normalize YouTube legacy custom channel URLs (accept single segment like /timwhite)
    if (/(?:www\.)?youtube\.com/i.test(parsedUrl.hostname)) {
      const path = parsedUrl.pathname;
      const parts = path.split('/').filter(Boolean);
      const reserved = [
        'watch',
        'results',
        'shorts',
        'live',
        'playlist',
        'feed',
        'gaming',
        'music',
        'premium',
        'c',
        'channel',
        'user',
        'embed',
      ];
      // If a single-segment legacy custom URL and not reserved, keep as-is
      if (parts.length === 1 && !reserved.includes(parts[0].toLowerCase())) {
        // no-op; just ensuring we don't reject/transform it unnecessarily
      }
    }

    // Platform-specific URL normalization
    if (/(?:www\.)?tiktok\.com/i.test(parsedUrl.hostname)) {
      // Auto-add @ for TikTok handles if missing, but avoid reserved paths
      const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
      const reservedPaths = [
        'for',
        'following',
        'live',
        'upload',
        'search',
        'discover',
        'trending',
      ];

      if (
        pathParts.length > 0 &&
        !pathParts[0].startsWith('@') &&
        !reservedPaths.includes(pathParts[0].toLowerCase()) &&
        // Basic username validation: alphanumeric, dots, underscores only
        /^[a-zA-Z0-9._]+$/.test(pathParts[0])
      ) {
        pathParts[0] = '@' + pathParts[0];
        parsedUrl.pathname = '/' + pathParts.join('/');
      }
    }

    // Remove UTM parameters and tracking
    const paramsToRemove = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      'igshid',
      '_ga',
      'ref',
      'source',
    ];

    paramsToRemove.forEach(param => {
      parsedUrl.searchParams.delete(param);
    });

    return parsedUrl.toString();
  } catch {
    return url; // Return original if URL parsing fails
  }
}

/**
 * Detect platform from URL and return normalized link info
 */
export function detectPlatform(url: string): DetectedLink {
  const normalizedUrl = normalizeUrl(url);

  // Find matching platform
  let detectedPlatform: PlatformInfo | null = null;

  for (const { pattern, platformId } of DOMAIN_PATTERNS) {
    if (pattern.test(normalizedUrl)) {
      detectedPlatform = PLATFORMS[platformId];
      break;
    }
  }

  // Fallback to custom/website
  if (!detectedPlatform) {
    detectedPlatform = PLATFORMS.website;
  }

  // Generate suggested title
  const suggestedTitle = generateSuggestedTitle(
    normalizedUrl,
    detectedPlatform
  );

  // Validate URL
  const isValid = validateUrl(normalizedUrl, detectedPlatform);

  return {
    platform: detectedPlatform,
    normalizedUrl,
    originalUrl: url,
    suggestedTitle,
    isValid,
    error: isValid ? undefined : 'Invalid URL format',
  };
}

/**
 * Generate a suggested title for the link
 */
function generateSuggestedTitle(url: string, platform: PlatformInfo): string {
  try {
    const parsedUrl = new URL(url);

    // Extract meaningful parts for different platforms
    switch (platform.id) {
      case 'spotify':
        if (url.includes('/artist/')) {
          return `${platform.name} Artist`;
        }
        if (url.includes('/album/')) {
          return `${platform.name} Album`;
        }
        if (url.includes('/track/')) {
          return `${platform.name} Track`;
        }
        return platform.name;

      case 'instagram':
      case 'twitter':
      case 'tiktok': {
        const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
        if (pathParts.length > 0) {
          const username = pathParts[0].replace('@', '');
          return `${platform.name} (@${username})`;
        }
        return platform.name;
      }

      case 'youtube': {
        if (
          url.includes('/c/') ||
          url.includes('/channel/') ||
          url.includes('/@')
        ) {
          return `${platform.name} Channel`;
        }
        return platform.name;
      }

      default:
        return platform.name;
    }
  } catch {
    return platform.name;
  }
}

/**
 * Validate URL format for specific platform
 */
function validateUrl(url: string, platform: PlatformInfo): boolean {
  try {
    new URL(url); // Basic URL validation

    // Platform-specific validation rules
    switch (platform.id) {
      case 'spotify':
        return /open\.spotify\.com\/(artist|album|track|playlist)\/[a-zA-Z0-9]+/.test(
          url
        );
      case 'instagram':
        return /instagram\.com\/[a-zA-Z0-9._]+\/?$/.test(url);
      case 'twitter':
        return /(twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/?$/.test(url);
      case 'tiktok':
        return /tiktok\.com\/@[a-zA-Z0-9._]+\/?$/.test(url);
      case 'youtube': {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, '');
        const path = u.pathname;
        const parts = path.split('/').filter(Boolean);
        const reserved = new Set([
          'watch',
          'results',
          'shorts',
          'live',
          'playlist',
          'feed',
          'gaming',
          'music',
          'premium',
          'embed',
          'c',
          'channel',
          'user',
        ]);

        if (host === 'youtu.be') {
          return /^\/[A-Za-z0-9_-]{6,}/.test(path);
        }
        if (host === 'youtube.com') {
          if (/^\/(c|channel|user)\/[A-Za-z0-9_-]+/.test(path)) return true;
          if (/^\/@[A-Za-z0-9._-]+/.test(path)) return true;
          if (/^\/shorts\/[A-Za-z0-9_-]+/.test(path)) return true;
          if (u.searchParams.get('v')) return true; // watch?v=
          if (parts.length === 1 && !reserved.has(parts[0].toLowerCase())) {
            return true; // legacy custom URL like /timwhite
          }
        }
        return false;
      }
      default:
        return true; // Basic URL validation passed
    }
  } catch {
    return false;
  }
}

/**
 * Get all available platforms grouped by category
 */
export function getPlatformsByCategory(): Record<string, PlatformInfo[]> {
  const categorized: Record<string, PlatformInfo[]> = {
    dsp: [],
    social: [],
    custom: [],
  };

  Object.values(PLATFORMS).forEach(platform => {
    categorized[platform.category].push(platform);
  });

  return categorized;
}

/**
 * Check if a platform is a DSP (Digital Service Provider)
 */
export function isDSPPlatform(platform: PlatformInfo): boolean {
  return platform.category === 'dsp';
}

/**
 * Check if a platform is a social platform
 */
export function isSocialPlatform(platform: PlatformInfo): boolean {
  return platform.category === 'social';
}

/**
 * Get platform by ID
 */
export function getPlatform(id: string): PlatformInfo | undefined {
  return PLATFORMS[id];
}

/**
 * Dynamically get the correct base URL for the current environment
 * This ensures profile links work correctly in local, preview, and production environments
 */
export function getBaseUrl(): string {
  // If we have NEXT_PUBLIC_APP_URL from env, use that first
  if (typeof window !== 'undefined' && window.location) {
    // Client-side: use current origin for local/preview environments
    const { protocol, hostname, port } = window.location;

    // For local development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
    }

    // For preview environments (typically preview.jov.ie or similar)
    if (hostname.includes('preview') || hostname.includes('vercel.app')) {
      return `${protocol}//${hostname}`;
    }
  }

  // Server-side or fallback: use environment variable or production URL
  return process.env.NEXT_PUBLIC_APP_URL || 'https://jov.ie';
}

/**
 * Check if we're in a development environment
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if we're in a preview environment
 */
export function isPreview(): boolean {
  if (typeof window !== 'undefined') {
    return (
      window.location.hostname.includes('preview') ||
      window.location.hostname.includes('vercel.app')
    );
  }
  return process.env.VERCEL_ENV === 'preview';
}

/**
 * Check if we're in production
 */
export function isProduction(): boolean {
  if (typeof window !== 'undefined') {
    return window.location.hostname === 'jov.ie';
  }
  return (
    process.env.NODE_ENV === 'production' &&
    process.env.VERCEL_ENV === 'production'
  );
}
