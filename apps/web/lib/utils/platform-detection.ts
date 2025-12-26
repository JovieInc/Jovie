/**
 * Platform Detection and Link Normalization Service
 * Atomic utility for identifying and normalizing social/music platform links
 */

/**
 * Platform category types
 * - dsp: Digital Service Providers (music streaming platforms like Spotify, Apple Music)
 * - social: Social media platforms (Instagram, TikTok, Twitter, etc.)
 * - earnings: Monetization platforms (Venmo, PayPal, Patreon, etc.)
 * - websites: Link aggregators and personal websites (Linktree, personal sites)
 * - custom: User-defined custom links
 */
export type PlatformCategory =
  | 'dsp'
  | 'social'
  | 'earnings'
  | 'websites'
  | 'custom';

export interface PlatformInfo {
  id: string;
  name: string;
  category: PlatformCategory;
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
  'amazon-music': {
    id: 'amazon-music',
    name: 'Amazon Music',
    category: 'dsp',
    icon: 'amazon',
    color: 'FF9900',
    placeholder: 'https://music.amazon.com/artists/...',
  },
  bandcamp: {
    id: 'bandcamp',
    name: 'Bandcamp',
    category: 'dsp',
    icon: 'bandcamp',
    color: '629AA0',
    placeholder: 'https://username.bandcamp.com',
  },
  'tencent-music': {
    id: 'tencent-music',
    name: 'Tencent Music',
    category: 'dsp',
    icon: 'qq',
    color: '12B7F5',
    placeholder: 'https://y.qq.com/n/ryqq/singer/...',
  },
  netease: {
    id: 'netease',
    name: 'Netease Music',
    category: 'dsp',
    icon: 'neteasecloudmusic',
    color: 'C20C0C',
    placeholder: 'https://music.163.com/#/artist?id=...',
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
    category: 'earnings',
    icon: 'venmo',
    color: '3D95CE',
    placeholder: 'https://venmo.com/username',
  },
  website: {
    id: 'website',
    name: 'Website',
    category: 'websites',
    icon: 'website',
    color: '6B7280',
    placeholder: 'https://your-website.com',
  },
  linktree: {
    id: 'linktree',
    name: 'Linktree',
    category: 'websites',
    icon: 'linktree',
    color: '39E09B',
    placeholder: 'https://linktr.ee/username',
  },
  laylo: {
    id: 'laylo',
    name: 'Laylo',
    category: 'websites',
    icon: 'link',
    color: '6B7280',
    placeholder: 'https://laylo.com/username',
  },
  beacons: {
    id: 'beacons',
    name: 'Beacons',
    category: 'websites',
    icon: 'link',
    color: '6B7280',
    placeholder: 'https://beacons.ai/username',
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
  // Additional DSP platforms
  tidal: {
    id: 'tidal',
    name: 'Tidal',
    category: 'dsp',
    icon: 'tidal',
    color: '000000',
    placeholder: 'https://tidal.com/artist/...',
  },
  deezer: {
    id: 'deezer',
    name: 'Deezer',
    category: 'dsp',
    icon: 'deezer',
    color: 'FEAA2D',
    placeholder: 'https://www.deezer.com/artist/...',
  },
  pandora: {
    id: 'pandora',
    name: 'Pandora',
    category: 'dsp',
    icon: 'pandora',
    color: '005483',
    placeholder: 'https://www.pandora.com/artist/...',
  },
  // Additional earnings platforms
  patreon: {
    id: 'patreon',
    name: 'Patreon',
    category: 'earnings',
    icon: 'patreon',
    color: 'FF424D',
    placeholder: 'https://www.patreon.com/username',
  },
  'buy-me-a-coffee': {
    id: 'buy-me-a-coffee',
    name: 'Buy Me a Coffee',
    category: 'earnings',
    icon: 'buymeacoffee',
    color: 'FFDD00',
    placeholder: 'https://www.buymeacoffee.com/username',
  },
  kofi: {
    id: 'kofi',
    name: 'Ko-fi',
    category: 'earnings',
    icon: 'kofi',
    color: 'FF5E5B',
    placeholder: 'https://ko-fi.com/username',
  },
  paypal: {
    id: 'paypal',
    name: 'PayPal',
    category: 'earnings',
    icon: 'paypal',
    color: '00457C',
    placeholder: 'https://paypal.me/username',
  },
  cashapp: {
    id: 'cashapp',
    name: 'Cash App',
    category: 'earnings',
    icon: 'cashapp',
    color: '00D632',
    placeholder: 'https://cash.app/$username',
  },
  shopify: {
    id: 'shopify',
    name: 'Shopify',
    category: 'earnings',
    icon: 'shopify',
    color: '7AB55C',
    placeholder: 'https://your-store.myshopify.com',
  },
  etsy: {
    id: 'etsy',
    name: 'Etsy',
    category: 'earnings',
    icon: 'etsy',
    color: 'F16521',
    placeholder: 'https://www.etsy.com/shop/StoreName',
  },
  // Additional creator/content platforms
  substack: {
    id: 'substack',
    name: 'Substack',
    category: 'social',
    icon: 'substack',
    color: 'FF6719',
    placeholder: 'https://username.substack.com',
  },
  medium: {
    id: 'medium',
    name: 'Medium',
    category: 'social',
    icon: 'medium',
    color: '000000',
    placeholder: 'https://medium.com/@username',
  },
  github: {
    id: 'github',
    name: 'GitHub',
    category: 'social',
    icon: 'github',
    color: '181717',
    placeholder: 'https://github.com/username',
  },
  behance: {
    id: 'behance',
    name: 'Behance',
    category: 'social',
    icon: 'behance',
    color: '1769FF',
    placeholder: 'https://behance.net/username',
  },
  dribbble: {
    id: 'dribbble',
    name: 'Dribbble',
    category: 'social',
    icon: 'dribbble',
    color: 'EA4C89',
    placeholder: 'https://dribbble.com/username',
  },
  // Additional link aggregators
  linkfire: {
    id: 'linkfire',
    name: 'Linkfire',
    category: 'websites',
    icon: 'linkfire',
    color: 'FFB81C',
    placeholder: 'https://lnk.to/...',
  },
  toneden: {
    id: 'toneden',
    name: 'ToneDen',
    category: 'websites',
    icon: 'toneden',
    color: '007AFF',
    placeholder: 'https://toneden.io/...',
  },
  // Additional messaging platforms
  whatsapp: {
    id: 'whatsapp',
    name: 'WhatsApp',
    category: 'social',
    icon: 'whatsapp',
    color: '25D366',
    placeholder: 'https://wa.me/...',
  },
  signal: {
    id: 'signal',
    name: 'Signal',
    category: 'social',
    icon: 'signal',
    color: '3A76F0',
    placeholder: 'https://signal.me/...',
  },
  // Additional professional platforms
  blog: {
    id: 'blog',
    name: 'Blog',
    category: 'websites',
    icon: 'rss',
    color: '6B7280',
    placeholder: 'https://your-blog.com',
  },
  portfolio: {
    id: 'portfolio',
    name: 'Portfolio',
    category: 'websites',
    icon: 'briefcase',
    color: '6B7280',
    placeholder: 'https://your-portfolio.com',
  },
  cameo: {
    id: 'cameo',
    name: 'Cameo',
    category: 'earnings',
    icon: 'cameo',
    color: '8A2BE2',
    placeholder: 'https://cameo.com/username',
  },
};

// Domain pattern matching for platform detection
const DOMAIN_PATTERNS: Array<{ pattern: RegExp; platformId: string }> = [
  // DSP platforms (Digital Service Providers)
  { pattern: /(?:open\.)?spotify\.com/i, platformId: 'spotify' },
  { pattern: /music\.apple\.com/i, platformId: 'apple-music' },
  {
    pattern: /music\.youtube\.com|youtube\.com\/(channel|@)/i,
    platformId: 'youtube-music',
  },
  { pattern: /soundcloud\.com/i, platformId: 'soundcloud' },
  { pattern: /bandcamp\.com/i, platformId: 'bandcamp' },
  { pattern: /(?:www\.)?tidal\.com/i, platformId: 'tidal' },
  { pattern: /(?:www\.)?deezer\.com/i, platformId: 'deezer' },
  { pattern: /(?:www\.)?pandora\.com/i, platformId: 'pandora' },
  { pattern: /music\.amazon\.com/i, platformId: 'amazon-music' },

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
  { pattern: /(?:www\.)?onlyfans\.com/i, platformId: 'onlyfans' },
  { pattern: /(?:t\.me|telegram\.me)/i, platformId: 'telegram' },
  { pattern: /(?:www\.)?line\.me/i, platformId: 'line' },
  { pattern: /(?:www\.)?viber\.com/i, platformId: 'viber' },
  { pattern: /(?:www\.)?rumble\.com/i, platformId: 'rumble' },
  { pattern: /(?:www\.)?threads\.net/i, platformId: 'threads' },
  { pattern: /(?:www\.)?quora\.com/i, platformId: 'quora' },
  {
    pattern: /(?:www\.)?discord\.gg|discord\.com\/invite/i,
    platformId: 'discord',
  },

  // Creator platforms
  { pattern: /(?:www\.)?patreon\.com/i, platformId: 'patreon' },
  { pattern: /(?:www\.)?substack\.com/i, platformId: 'substack' },
  { pattern: /(?:www\.)?medium\.com/i, platformId: 'medium' },
  { pattern: /(?:www\.)?github\.com/i, platformId: 'github' },
  { pattern: /(?:www\.)?behance\.net/i, platformId: 'behance' },
  { pattern: /(?:www\.)?dribbble\.com/i, platformId: 'dribbble' },

  // Payment/earnings platforms
  { pattern: /(?:www\.)?venmo\.com/i, platformId: 'venmo' },
  { pattern: /(?:www\.)?patreon\.com/i, platformId: 'patreon' },
  { pattern: /(?:www\.)?buymeacoffee\.com/i, platformId: 'buy-me-a-coffee' },
  { pattern: /(?:www\.)?ko-fi\.com/i, platformId: 'kofi' },
  { pattern: /(?:www\.)?paypal\.(?:me|com)/i, platformId: 'paypal' },
  { pattern: /(?:www\.)?cash\.app/i, platformId: 'cashapp' },
  { pattern: /(?:www\.)?etsy\.com/i, platformId: 'etsy' },
  { pattern: /\.myshopify\.com/i, platformId: 'shopify' },
  { pattern: /(?:www\.)?cameo\.com/i, platformId: 'cameo' },

  // Messaging platforms
  { pattern: /(?:www\.)?wa\.me|whatsapp\.com/i, platformId: 'whatsapp' },
  { pattern: /signal\.me/i, platformId: 'signal' },

  // Link aggregators
  { pattern: /(?:linktr\.ee|linktree\.com)/i, platformId: 'linktree' },
  { pattern: /(?:www\.)?beacons\.ai/i, platformId: 'beacons' },
  { pattern: /(?:www\.)?lnk\.to|linkfire\.com/i, platformId: 'linkfire' },
  { pattern: /(?:www\.)?toneden\.io/i, platformId: 'toneden' },
  { pattern: /(?:www\.)?laylo\.com/i, platformId: 'laylo' },

  // Detection-only platforms
  { pattern: /y\.qq\.com/i, platformId: 'tencent-music' },
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
      [/\b(pinterest)com\b/i, '$1.com'],
      [/\b(snapchat)com\b/i, '$1.com'],
      [/\b(twitch)tv\b/i, '$1.tv'],
      [/\b(paypal)com\b/i, '$1.com'],
      [/\b(linkedin)com\b/i, '$1.com'],
      [/\b(reddit)com\b/i, '$1.com'],
      [/\b(patreon)com\b/i, '$1.com'],
      [/\b(medium)com\b/i, '$1.com'],
    ];
    for (const [pattern, replacement] of dotFixes) {
      url = url.replace(pattern, replacement);
    }

    // Enforce https
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      url = 'https://' + url;
    } else if (url.startsWith('http://')) {
      url = 'https://' + url.slice(7);
    }

    // Remove trailing slashes for consistency
    if (url.endsWith('/') && url !== 'https://') {
      url = url.slice(0, -1);
    }

    return url;
  } catch {
    return url;
  }
}

/**
 * Extract and return a sensible platform ID from a raw, possibly malformed URL.
 * Returns null if no platform match is found.
 */
export function detectPlatformFromUrl(url: string): string | null {
  try {
    const normalized = normalizeUrl(url);
    const urlObj = new URL(normalized);
    const hostname = urlObj.hostname.toLowerCase();

    for (const { pattern, platformId } of DOMAIN_PATTERNS) {
      if (pattern.test(hostname)) {
        return platformId;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get platform info by ID
 */
export function getPlatformInfo(platformId: string): PlatformInfo | null {
  return PLATFORMS[platformId] ?? null;
}

/**
 * Detect a platform from a URL and return full platform info
 */
export function detectPlatform(url: string): PlatformInfo | null {
  const platformId = detectPlatformFromUrl(url);
  if (!platformId) {
    return null;
  }
  return getPlatformInfo(platformId);
}

/**
 * Validate a link and return detection information
 */
export function validateLink(
  url: string,
  platformId?: string
): DetectedLink | null {
  try {
    const normalized = normalizeUrl(url);
    const detected = platformId
      ? getPlatformInfo(platformId)
      : detectPlatform(normalized);

    if (!detected) {
      return {
        platform: getPlatformInfo('website') || {
          id: 'unknown',
          name: 'Unknown',
          category: 'custom',
          icon: 'link',
          color: '6B7280',
          placeholder: 'https://example.com',
        },
        normalizedUrl: normalized,
        originalUrl: url,
        suggestedTitle: new URL(normalized).hostname,
        isValid: false,
        error: 'Unable to detect platform',
      };
    }

    return {
      platform: detected,
      normalizedUrl: normalized,
      originalUrl: url,
      suggestedTitle: detected.name,
      isValid: true,
    };
  } catch (error) {
    return {
      platform: getPlatformInfo('website') || {
        id: 'unknown',
        name: 'Unknown',
        category: 'custom',
        icon: 'link',
        color: '6B7280',
        placeholder: 'https://example.com',
      },
      normalizedUrl: url,
      originalUrl: url,
      suggestedTitle: 'Invalid URL',
      isValid: false,
      error: error instanceof Error ? error.message : 'Invalid URL',
    };
  }
}

/**
 * Get all platforms in a specific category
 */
export function getPlatformsByCategory(
  category: PlatformCategory
): PlatformInfo[] {
  return Object.values(PLATFORMS).filter(p => p.category === category);
}

/**
 * Get all available platforms
 */
export function getAllPlatforms(): PlatformInfo[] {
  return Object.values(PLATFORMS);
}
