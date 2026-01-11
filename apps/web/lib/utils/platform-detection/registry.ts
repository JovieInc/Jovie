/**
 * Platform Registry
 * Platform configurations, domain patterns, and helper functions
 *
 * This module imports platform metadata from the canonical source (constants/platforms.ts)
 * and extends it with detection-specific fields like placeholders.
 */

import {
  PLATFORM_METADATA_MAP,
  type PlatformMetadata,
} from '@/constants/platforms';

import type { DetectionCategory, DomainPattern, PlatformInfo } from './types';

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
export const PLATFORMS: Record<string, PlatformInfo> = {
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
  featurefm: createPlatformInfo('featurefm', 'https://ffm.to/...'),

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

/**
 * Domain pattern matching for platform detection
 * Uses canonical platform IDs from constants/platforms.ts (snake_case format)
 */
export const DOMAIN_PATTERNS: DomainPattern[] = [
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
  { pattern: /(?:www\.)?ffm\.to|feature\.fm/i, platformId: 'featurefm' },
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
export const DOMAIN_MISSPELLINGS: Record<string, string> = {
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
