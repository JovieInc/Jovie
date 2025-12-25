/**
 * Platform Detection and Link Normalization Service
 * Atomic utility for identifying and normalizing social/music platform links
 *
 * This module imports platform metadata from the canonical source (constants/platforms.ts)
 * and extends it with detection-specific fields like placeholders.
 */

import {
  PLATFORM_METADATA_MAP,
  type PlatformMetadata,
} from '@/constants/platforms';

/**
 * Detection-specific category types.
 * Maps from canonical categories to detection categories.
 */
export type DetectionCategory =
  | 'dsp'
  | 'social'
  | 'earnings'
  | 'websites'
  | 'custom';

export interface PlatformInfo {
  id: string;
  name: string;
  category: DetectionCategory; // DSP = Digital Service Provider (music platforms)
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

/**
 * Maps canonical platform categories to detection categories
 */
function mapCategoryToDetectionCategory(
  category: PlatformMetadata['category']
): DetectionCategory {
  switch (category) {
    case 'music':
      return 'dsp';
    case 'social':
    case 'creator':
    case 'messaging':
      return 'social';
    case 'payment':
      return 'earnings';
    case 'link_aggregators':
    case 'professional':
      return 'websites';
    default:
      return 'custom';
  }
}

/**
 * Creates a PlatformInfo from canonical metadata with detection-specific extensions
 */
function createPlatformInfo(
  id: string,
  placeholder: string,
  overrides?: Partial<Omit<PlatformInfo, 'id' | 'placeholder'>>
): PlatformInfo {
  const canonical = PLATFORM_METADATA_MAP[id];
  if (canonical) {
    return {
      id: canonical.id,
      name: overrides?.name ?? canonical.name,
      category:
        overrides?.category ??
        mapCategoryToDetectionCategory(canonical.category),
      icon: overrides?.icon ?? canonical.icon,
      color: overrides?.color ?? canonical.color,
      placeholder,
    };
  }
  // Fallback for platforms not in canonical registry
  return {
    id,
    name: overrides?.name ?? id,
    category: overrides?.category ?? 'custom',
    icon: overrides?.icon ?? 'link',
    color: overrides?.color ?? '6B7280',
    placeholder,
  };
}

/**
 * Platform configuration registry
 * Uses canonical platform metadata from constants/platforms.ts with detection-specific placeholders
 */
const PLATFORMS: Record<string, PlatformInfo> = {
  // Music Platforms (DSPs)
  spotify: createPlatformInfo('spotify', 'https://open.spotify.com/artist/...'),
  apple_music: createPlatformInfo(
    'apple_music',
    'https://music.apple.com/artist/...'
  ),
  youtube_music: createPlatformInfo(
    'youtube_music',
    'https://music.youtube.com/channel/...'
  ),
  soundcloud: createPlatformInfo(
    'soundcloud',
    'https://soundcloud.com/username'
  ),
  bandcamp: createPlatformInfo('bandcamp', 'https://username.bandcamp.com'),
  amazon_music: createPlatformInfo(
    'amazon_music',
    'https://music.amazon.com/artists/...'
  ),
  tidal: createPlatformInfo('tidal', 'https://tidal.com/browse/artist/...'),
  deezer: createPlatformInfo('deezer', 'https://deezer.com/artist/...'),
  pandora: createPlatformInfo('pandora', 'https://pandora.com/artist/...'),

  // Social Media Platforms
  instagram: createPlatformInfo('instagram', 'https://instagram.com/username'),
  twitter: createPlatformInfo('twitter', 'https://x.com/username', {
    name: 'X (Twitter)',
  }),
  x: createPlatformInfo('x', 'https://x.com/username'),
  tiktok: createPlatformInfo('tiktok', 'https://tiktok.com/@username'),
  youtube: createPlatformInfo('youtube', 'https://youtube.com/@username'),
  facebook: createPlatformInfo('facebook', 'https://facebook.com/username'),
  linkedin: createPlatformInfo('linkedin', 'https://linkedin.com/in/username'),
  snapchat: createPlatformInfo(
    'snapchat',
    'https://www.snapchat.com/add/username'
  ),
  pinterest: createPlatformInfo(
    'pinterest',
    'https://www.pinterest.com/username'
  ),
  reddit: createPlatformInfo('reddit', 'https://www.reddit.com/user/username'),

  // Creator/Content Platforms
  twitch: createPlatformInfo('twitch', 'https://twitch.tv/username'),
  discord: createPlatformInfo('discord', 'https://discord.gg/inviteCode'),
  patreon: createPlatformInfo('patreon', 'https://patreon.com/username'),
  onlyfans: createPlatformInfo('onlyfans', 'https://onlyfans.com/username'),
  substack: createPlatformInfo('substack', 'https://username.substack.com'),
  medium: createPlatformInfo('medium', 'https://medium.com/@username'),
  github: createPlatformInfo('github', 'https://github.com/username'),
  behance: createPlatformInfo('behance', 'https://behance.net/username'),
  dribbble: createPlatformInfo('dribbble', 'https://dribbble.com/username'),

  // Link Aggregators
  linktree: createPlatformInfo('linktree', 'https://linktr.ee/username'),
  beacons: createPlatformInfo('beacons', 'https://beacons.ai/username'),
  linkfire: createPlatformInfo('linkfire', 'https://lnk.to/...'),
  toneden: createPlatformInfo('toneden', 'https://toneden.io/...'),

  // Payment/Tip Platforms
  venmo: createPlatformInfo('venmo', 'https://venmo.com/username'),
  paypal: createPlatformInfo('paypal', 'https://paypal.me/username'),
  cashapp: createPlatformInfo('cashapp', 'https://cash.app/$username'),
  ko_fi: createPlatformInfo('ko_fi', 'https://ko-fi.com/username'),
  buymeacoffee: createPlatformInfo(
    'buymeacoffee',
    'https://buymeacoffee.com/username'
  ),

  // Messaging Platforms
  telegram: createPlatformInfo('telegram', 'https://t.me/username'),
  whatsapp: createPlatformInfo('whatsapp', 'https://wa.me/...'),
  signal: createPlatformInfo('signal', 'https://signal.me/...'),

  // Professional
  website: createPlatformInfo('website', 'https://your-website.com'),
  blog: createPlatformInfo('blog', 'https://your-blog.com'),
  portfolio: createPlatformInfo('portfolio', 'https://your-portfolio.com'),

  // Detection-only platforms (not in canonical registry)
  tencent_music: createPlatformInfo(
    'tencent_music',
    'https://y.qq.com/n/ryqq/singer/...',
    { name: 'Tencent Music', category: 'dsp', icon: 'qq', color: '12B7F5' }
  ),
  netease: createPlatformInfo(
    'netease',
    'https://music.163.com/#/artist?id=...',
    {
      name: 'Netease Music',
      category: 'dsp',
      icon: 'neteasecloudmusic',
      color: 'C20C0C',
    }
  ),
  laylo: createPlatformInfo('laylo', 'https://laylo.com/username', {
    name: 'Laylo',
    category: 'websites',
    icon: 'link',
    color: '6B7280',
  }),
  quora: createPlatformInfo('quora', 'https://www.quora.com/profile/Name', {
    name: 'Quora',
    category: 'social',
    icon: 'quora',
    color: 'B92B27',
  }),
  threads: createPlatformInfo('threads', 'https://www.threads.net/@username', {
    name: 'Threads',
    category: 'social',
    icon: 'threads',
    color: '000000',
  }),
  line: createPlatformInfo('line', 'https://line.me/R/ti/p/@username', {
    name: 'LINE',
    category: 'social',
    icon: 'line',
    color: '00C300',
  }),
  viber: createPlatformInfo('viber', 'https://www.viber.com/username', {
    name: 'Viber',
    category: 'social',
    icon: 'viber',
    color: '7360F2',
  }),
  rumble: createPlatformInfo('rumble', 'https://rumble.com/c/ChannelName', {
    name: 'Rumble',
    category: 'social',
    icon: 'rumble',
    color: '85C742',
  }),
  cameo: createPlatformInfo('cameo', 'https://cameo.com/username', {
    name: 'Cameo',
    category: 'social',
    icon: 'cameo',
    color: '8A2BE2',
  }),
};

// Domain pattern matching for platform detection
// Uses canonical platform IDs from constants/platforms.ts (snake_case format)
const DOMAIN_PATTERNS: Array<{ pattern: RegExp; platformId: string }> = [
  // DSP platforms (Digital Service Providers)
  { pattern: /(?:open\.)?spotify\.com/i, platformId: 'spotify' },
  { pattern: /music\.apple\.com/i, platformId: 'apple_music' },
  {
    pattern: /music\.youtube\.com|youtube\.com\/(channel|@)/i,
    platformId: 'youtube_music',
  },
  { pattern: /soundcloud\.com/i, platformId: 'soundcloud' },
  { pattern: /bandcamp\.com/i, platformId: 'bandcamp' },
  { pattern: /music\.amazon\.com/i, platformId: 'amazon_music' },
  { pattern: /tidal\.com/i, platformId: 'tidal' },
  { pattern: /deezer\.com/i, platformId: 'deezer' },

  // Social platforms (including YouTube for social/channels)
  { pattern: /(?:www\.)?youtube\.com|youtu\.be/i, platformId: 'youtube' },
  { pattern: /(?:www\.)?instagram\.com/i, platformId: 'instagram' },
  { pattern: /(?:www\.)?tiktok\.com/i, platformId: 'tiktok' },
  { pattern: /(?:twitter\.com|x\.com)/i, platformId: 'twitter' },
  { pattern: /(?:www\.)?facebook\.com/i, platformId: 'facebook' },
  { pattern: /(?:www\.)?twitch\.tv/i, platformId: 'twitch' },
  { pattern: /(?:www\.)?linkedin\.com/i, platformId: 'linkedin' },
  { pattern: /(?:www\.)?reddit\.com/i, platformId: 'reddit' },
  { pattern: /(?:www\.)?pinterest\.com/i, platformId: 'pinterest' },
  { pattern: /(?:www\.)?snapchat\.com/i, platformId: 'snapchat' },

  // Creator platforms
  {
    pattern: /(?:www\.)?discord\.gg|discord\.com\/invite/i,
    platformId: 'discord',
  },
  { pattern: /(?:www\.)?patreon\.com/i, platformId: 'patreon' },
  { pattern: /(?:www\.)?onlyfans\.com/i, platformId: 'onlyfans' },
  { pattern: /(?:www\.)?substack\.com/i, platformId: 'substack' },
  { pattern: /(?:www\.)?medium\.com/i, platformId: 'medium' },
  { pattern: /(?:www\.)?github\.com/i, platformId: 'github' },
  { pattern: /(?:www\.)?behance\.net/i, platformId: 'behance' },
  { pattern: /(?:www\.)?dribbble\.com/i, platformId: 'dribbble' },
  { pattern: /(?:www\.)?cameo\.com/i, platformId: 'cameo' },

  // Payment platforms
  { pattern: /(?:www\.)?venmo\.com/i, platformId: 'venmo' },
  { pattern: /(?:www\.)?paypal\.me|paypal\.com/i, platformId: 'paypal' },
  { pattern: /(?:www\.)?cash\.app/i, platformId: 'cashapp' },
  { pattern: /(?:www\.)?ko-fi\.com/i, platformId: 'ko_fi' },
  { pattern: /(?:www\.)?buymeacoffee\.com/i, platformId: 'buymeacoffee' },

  // Messaging platforms
  { pattern: /(?:t\.me|telegram\.me)/i, platformId: 'telegram' },
  { pattern: /(?:www\.)?wa\.me|whatsapp\.com/i, platformId: 'whatsapp' },

  // Link aggregators
  { pattern: /(?:linktr\.ee|linktree\.com)/i, platformId: 'linktree' },
  { pattern: /(?:www\.)?beacons\.ai/i, platformId: 'beacons' },
  { pattern: /(?:www\.)?lnk\.to|linkfire\.com/i, platformId: 'linkfire' },
  { pattern: /(?:www\.)?toneden\.io/i, platformId: 'toneden' },
  { pattern: /(?:www\.)?laylo\.com/i, platformId: 'laylo' },

  // Detection-only platforms
  { pattern: /(?:www\.)?line\.me/i, platformId: 'line' },
  { pattern: /(?:www\.)?viber\.com/i, platformId: 'viber' },
  { pattern: /(?:www\.)?rumble\.com/i, platformId: 'rumble' },
  { pattern: /(?:www\.)?threads\.net/i, platformId: 'threads' },
  { pattern: /(?:www\.)?quora\.com/i, platformId: 'quora' },
  { pattern: /y\.qq\.com/i, platformId: 'tencent_music' },
  { pattern: /music\.163\.com/i, platformId: 'netease' },

  // Website fallback - keep last
  { pattern: /./, platformId: 'website' },
];

/**
 * Common domain misspellings mapped to correct domains
 */
const DOMAIN_MISSPELLINGS: Record<string, string> = {
  // Instagram misspellings
  'insatagram.com': 'instagram.com',
  'instagran.com': 'instagram.com',
  'instagarm.com': 'instagram.com',
  'instragram.com': 'instagram.com',
  'insragram.com': 'instagram.com',
  'intagram.com': 'instagram.com',
  'instagam.com': 'instagram.com',
  'instgram.com': 'instagram.com',
  'insagram.com': 'instagram.com',
  'instagrm.com': 'instagram.com',
  'instagramm.com': 'instagram.com',
  // TikTok misspellings
  'tiktoc.com': 'tiktok.com',
  'ticktok.com': 'tiktok.com',
  'tictok.com': 'tiktok.com',
  'tiktik.com': 'tiktok.com',
  'tikток.com': 'tiktok.com',
  'titkok.com': 'tiktok.com',
  // YouTube misspellings
  'yotube.com': 'youtube.com',
  'youtub.com': 'youtube.com',
  'youutube.com': 'youtube.com',
  'yuotube.com': 'youtube.com',
  'youtue.com': 'youtube.com',
  'youube.com': 'youtube.com',
  'yutube.com': 'youtube.com',
  'youtubee.com': 'youtube.com',
  // Twitter/X misspellings
  'twiter.com': 'twitter.com',
  'twtter.com': 'twitter.com',
  'twiiter.com': 'twitter.com',
  'twittter.com': 'twitter.com',
  'twitterr.com': 'twitter.com',
  // Spotify misspellings
  'spotfy.com': 'spotify.com',
  'spotiify.com': 'spotify.com',
  'spotifiy.com': 'spotify.com',
  'spotifi.com': 'spotify.com',
  'soptify.com': 'spotify.com',
  'spoitfy.com': 'spotify.com',
  // Facebook misspellings
  'facebok.com': 'facebook.com',
  'facbook.com': 'facebook.com',
  'faceboo.com': 'facebook.com',
  'faceebook.com': 'facebook.com',
  'faceboook.com': 'facebook.com',
  // LinkedIn misspellings
  'linkdin.com': 'linkedin.com',
  'linkedn.com': 'linkedin.com',
  'linkein.com': 'linkedin.com',
  'linkeind.com': 'linkedin.com',
  // SoundCloud misspellings
  'soundclod.com': 'soundcloud.com',
  'soundcoud.com': 'soundcloud.com',
  'souncloud.com': 'soundcloud.com',
  // Twitch misspellings
  'twich.tv': 'twitch.tv',
  'twicth.tv': 'twitch.tv',
  // Venmo misspellings
  'vemno.com': 'venmo.com',
  'vnemo.com': 'venmo.com',
};

/**
 * Normalize a URL by cleaning UTM parameters and enforcing HTTPS
 */
export function normalizeUrl(url: string): string {
  try {
    const lowered = url.trim().toLowerCase();
    const dangerousSchemes = [
      'javascript:',
      'data:',
      'vbscript:',
      'file:',
      'mailto:',
    ];
    if (dangerousSchemes.some(scheme => lowered.startsWith(scheme))) {
      throw new Error('Unsafe scheme');
    }
    // Block encoded control characters that can lead to injection
    const encodedControlPattern = /%(0a|0d|09|00)/i;
    if (encodedControlPattern.test(lowered)) {
      throw new Error('Unsafe encoded control characters');
    }

    // Normalize stray spaces around dots
    url = url.replace(/\s*\.\s*/g, '.');

    // Fix common domain misspellings
    for (const [misspelled, correct] of Object.entries(DOMAIN_MISSPELLINGS)) {
      // Case-insensitive replacement of misspelled domains
      const regex = new RegExp(misspelled.replace('.', '\\.'), 'gi');
      url = url.replace(regex, correct);
    }

    // Comma instead of dot before common TLDs (e.g., youtube,com)
    url = url.replace(/,(?=\s*(com|net|tv|be|gg|me)\b)/gi, '.');

    // Quick typo fixes: insert missing dots (or spaces/commas) before TLD for common platforms
    // e.g., youtubecom → youtube.com, instagramcom → instagram.com
    const dotFixes: Array<[RegExp, string]> = [
      // Fix .ocm typo to .com
      [/\.ocm(\/|$)/gi, '.com$1'],
      // Fix missing dots before TLDs
      [/\b(youtube)com\b/i, '$1.com'],
      [/\b(instagram)com\b/i, '$1.com'],
      [/\b(tiktok)com\b/i, '$1.com'],
      [/\b(twitter)com\b/i, '$1.com'],
      [/\b(facebook)com\b/i, '$1.com'],
      [/\b(soundcloud)com\b/i, '$1.com'],
      [/\b(bandcamp)com\b/i, '$1.com'],
      [/\b(spotify)com\b/i, '$1.com'],
      [/\b(venmo)com\b/i, '$1.com'],
      [/\b(linkedin)com\b/i, '$1.com'],
      [/\b(pinterest)com\b/i, '$1.com'],
      [/\b(reddit)com\b/i, '$1.com'],
      [/\b(onlyfans)com\b/i, '$1.com'],
      [/\b(quora)com\b/i, '$1.com'],
      [/\b(threads)net\b/i, '$1.net'],
      [/\b(twitch)tv\b/i, '$1.tv'],
      [/\b(rumble)com\b/i, '$1.com'],
      [/\b(linkedin)com\b/i, '$1.com'],
      [/\b(telegram)me\b/i, '$1.me'],
      [/\b(telegram)com\b/i, '$1.com'],
      [/\b(line)me\b/i, '$1.me'],
      [/\b(viber)com\b/i, '$1.com'],
      // Short domains / special cases
      [/\b(discord)gg\b/i, '$1.gg'],
      [/\b(t)me\b/i, '$1.me'],
      // With spaces or commas before TLDs
      [
        /\b(youtube|instagram|tiktok|twitter|facebook|soundcloud|bandcamp|spotify|venmo|linkedin|pinterest|reddit|onlyfans|quora|rumble)[\s,]+com\b/gi,
        '$1.com',
      ],
      [/\b(threads)[\s,]+net\b/gi, '$1.net'],
      [/\b(twitch)[\s,]+tv\b/gi, '$1.tv'],
      [/\b(youtu)[\s,]+be\b/gi, '$1.be'],
      [/\b(discord)[\s,]+gg\b/gi, '$1.gg'],
      [/\b(t)[\s,]+me\b/gi, '$1.me'],
    ];
    for (const [pattern, replacement] of dotFixes) {
      url = url.replace(pattern, replacement);
    }

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
export function detectPlatform(
  url: string,
  creatorName?: string
): DetectedLink {
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
    detectedPlatform,
    creatorName
  );

  // Validate URL
  const isValid = validateUrl(normalizedUrl, detectedPlatform);

  // Friendly error copy per platform
  const errorExamples: Record<string, string> = {
    spotify:
      'Add your artist ID. Example: https://open.spotify.com/artist/1234',
    instagram: 'Add your username. Example: https://instagram.com/username',
    tiktok: 'Add your username. Example: https://tiktok.com/@username',
    youtube: 'Add your handle. Example: https://youtube.com/@handle',
    twitter: 'Add your username. Example: https://x.com/username',
    venmo: 'Add your username. Example: https://venmo.com/username',
    facebook: 'Add your page name. Example: https://facebook.com/pagename',
    linkedin: 'Add your profile. Example: https://linkedin.com/in/username',
    soundcloud: 'Add your username. Example: https://soundcloud.com/username',
    twitch: 'Add your username. Example: https://twitch.tv/username',
    threads: 'Add your username. Example: https://threads.net/@username',
    snapchat: 'Add your username. Example: https://snapchat.com/add/username',
    discord: 'Add your invite code. Example: https://discord.gg/invitecode',
    telegram: 'Add your username. Example: https://t.me/username',
    reddit: 'Add your username. Example: https://reddit.com/u/username',
    pinterest: 'Add your username. Example: https://pinterest.com/username',
    onlyfans: 'Add your username. Example: https://onlyfans.com/username',
    linktree: 'Add your username. Example: https://linktr.ee/username',
    bandcamp: 'Add your subdomain. Example: https://username.bandcamp.com',
  };

  return {
    platform: detectedPlatform,
    normalizedUrl,
    originalUrl: url,
    suggestedTitle,
    isValid,
    error: isValid
      ? undefined
      : errorExamples[detectedPlatform.id] || 'Invalid URL format',
  };
}

/**
 * Generate a suggested title for the link
 * @param url The URL to generate a title for
 * @param platform The platform info
 * @param creatorName Optional creator's name to use in the title (e.g., "Tim White")
 */
function generateSuggestedTitle(
  url: string,
  platform: PlatformInfo,
  creatorName?: string
): string {
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
      case 'tiktok':
      case 'youtube':
      case 'facebook':
      case 'linkedin': {
        const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
        const username = pathParts[0]?.replace('@', '') || '';

        // If we have a creator name, use it in the title
        if (creatorName) {
          return `${creatorName} on ${platform.name}`;
        }

        // Fall back to username if available
        if (username) {
          if (platform.id === 'tiktok') {
            return `${platform.name} (@${username})`;
          }
          return `@${username} on ${platform.name}`;
        }

        return platform.name;
      }

      case 'youtube-channel': {
        if (creatorName) {
          return `${creatorName} on YouTube`;
        }
        return 'YouTube Channel';
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
    const lowered = url.trim().toLowerCase();
    const dangerousSchemes = [
      'javascript:',
      'data:',
      'vbscript:',
      'file:',
      'mailto:',
    ];
    if (dangerousSchemes.some(scheme => lowered.startsWith(scheme))) {
      return false;
    }
    if (/%(0a|0d|09|00)/i.test(lowered)) {
      return false;
    }

    new URL(url); // Basic URL validation

    const pathParts = new URL(url).pathname.split('/').filter(Boolean);
    const requiresHandle = new Set([
      'instagram',
      'twitter',
      'tiktok',
      'facebook',
      'linkedin',
      'venmo',
      'soundcloud',
      'twitch',
      'threads',
      'snapchat',
      'discord',
      'telegram',
      'reddit',
      'pinterest',
      'onlyfans',
      'linktree',
      'bandcamp',
      'line',
      'viber',
      'rumble',
      'youtube',
    ]);
    if (requiresHandle.has(platform.id)) {
      const last = pathParts[pathParts.length - 1] ?? '';
      // must have at least one non-separator character (not just @)
      if (!last.replace(/^@/, '').trim()) {
        return false;
      }
    }

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
      // Platforms that require a username/handle in the path
      case 'venmo':
        return /venmo\.com\/[a-zA-Z0-9_-]+\/?$/.test(url);
      case 'facebook':
        return /facebook\.com\/[a-zA-Z0-9._-]+\/?$/.test(url);
      case 'linkedin':
        return /linkedin\.com\/(in|company)\/[a-zA-Z0-9_-]+\/?$/.test(url);
      case 'soundcloud':
        return /soundcloud\.com\/[a-zA-Z0-9_-]+\/?/.test(url);
      case 'twitch':
        return /twitch\.tv\/[a-zA-Z0-9_]+\/?$/.test(url);
      case 'threads':
        return /threads\.net\/@[a-zA-Z0-9._]+\/?$/.test(url);
      case 'snapchat':
        return /snapchat\.com\/add\/[a-zA-Z0-9._-]+\/?$/.test(url);
      case 'discord':
        return /discord\.(gg|com\/invite)\/[a-zA-Z0-9]+\/?$/.test(url);
      case 'telegram':
        return /(t\.me|telegram\.me)\/[a-zA-Z0-9_]+\/?$/.test(url);
      case 'reddit':
        return /reddit\.com\/(r|u|user)\/[a-zA-Z0-9_]+\/?$/.test(url);
      case 'pinterest':
        return /pinterest\.com\/[a-zA-Z0-9_]+\/?$/.test(url);
      case 'onlyfans':
        return /onlyfans\.com\/[a-zA-Z0-9._]+\/?$/.test(url);
      case 'linktree':
        return /linktr\.ee\/[a-zA-Z0-9._]+\/?$/.test(url);
      case 'bandcamp':
        return /[a-zA-Z0-9_-]+\.bandcamp\.com\/?/.test(url);
      default:
        return true; // Basic URL validation passed for unknown platforms
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
 * Compute a canonical identity string used to detect duplicates across
 * small URL variations (missing dots, protocol, www, with/without @, etc.).
 * The identity is stable per platform + primary handle/ID where possible.
 */
export function canonicalIdentity(
  link: Pick<DetectedLink, 'platform' | 'normalizedUrl'>
): string {
  try {
    const u = new URL(link.normalizedUrl);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const parts = u.pathname.split('/').filter(Boolean);

    switch (link.platform.id) {
      case 'instagram':
      case 'twitter':
        // x.com and twitter.com both map here; username is first segment
        if (parts[0])
          return `${link.platform.id}:${parts[0].replace(/^@/, '').toLowerCase()}`;
        break;
      case 'tiktok':
        if (parts[0])
          return `${link.platform.id}:${parts[0].replace(/^@/, '').toLowerCase()}`;
        break;
      case 'youtube':
        // Prefer @handle, else channel/ID, else legacy single segment
        if (parts[0]?.startsWith('@'))
          return `youtube:${parts[0].slice(1).toLowerCase()}`;
        if (parts[0] === 'channel' && parts[1])
          return `youtube:channel:${parts[1].toLowerCase()}`;
        if (parts[0] === 'user' && parts[1])
          return `youtube:user:${parts[1].toLowerCase()}`;
        if (parts.length === 1)
          return `youtube:legacy:${parts[0].toLowerCase()}`;
        break;
      case 'facebook':
      case 'twitch':
      case 'linkedin':
      case 'soundcloud':
      case 'bandcamp':
        if (parts[0]) return `${link.platform.id}:${parts[0].toLowerCase()}`;
        break;
      case 'linktree':
        if (parts[0]) return `linktree:${parts[0].toLowerCase()}`;
        break;
      default:
        break;
    }

    // Fallback to host+path signature
    return `${link.platform.id}:${host}${u.pathname.toLowerCase()}`;
  } catch {
    // If parsing fails, fall back to normalized URL
    return `${link.platform.id}:${link.normalizedUrl.toLowerCase()}`;
  }
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

    // For staging or non-production deployments (e.g., Vercel preview URLs)
    if (
      hostname === 'main.jov.ie' ||
      hostname === 'main.meetjovie.com' ||
      hostname.includes('vercel.app')
    ) {
      return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
    }
  }

  // Server-side or fallback: use environment variable or production profile URL
  return (
    process.env.NEXT_PUBLIC_PROFILE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://jov.ie'
  );
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
      window.location.hostname.includes('vercel.app') ||
      window.location.hostname === 'main.jov.ie' ||
      window.location.hostname === 'main.meetjovie.com'
    );
  }
  return process.env.VERCEL_ENV === 'preview';
}

/**
 * Check if we're in production
 */
export function isProduction(): boolean {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    return (
      hostname === 'jov.ie' ||
      hostname === 'meetjovie.com' ||
      hostname === 'app.meetjovie.com'
    );
  }
  return (
    process.env.NODE_ENV === 'production' &&
    process.env.VERCEL_ENV === 'production'
  );
}
