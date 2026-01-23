/**
 * Platform Data
 *
 * Complete list of all supported platforms.
 */

import type { PlatformMetadata } from './types';

/**
 * Complete list of all supported platforms organized by category.
 */
export const ALL_PLATFORMS = [
  // ========================================
  // Music Platforms (DSPs)
  // ========================================
  {
    id: 'spotify',
    name: 'Spotify',
    category: 'music',
    icon: 'spotify',
    color: '1DB954',
  },
  {
    id: 'apple_music',
    name: 'Apple Music',
    category: 'music',
    icon: 'applemusic',
    color: 'FA2D48',
  },
  {
    id: 'youtube_music',
    name: 'YouTube Music',
    category: 'music',
    icon: 'youtubemusic',
    color: 'FF0000',
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    category: 'music',
    icon: 'soundcloud',
    color: 'FF5500',
  },
  {
    id: 'bandcamp',
    name: 'Bandcamp',
    category: 'music',
    icon: 'bandcamp',
    color: '629AA0',
  },
  {
    id: 'tidal',
    name: 'Tidal',
    category: 'music',
    icon: 'tidal',
    color: '000000',
  },
  {
    id: 'deezer',
    name: 'Deezer',
    category: 'music',
    icon: 'deezer',
    color: 'FEAA2D',
  },
  {
    id: 'amazon_music',
    name: 'Amazon Music',
    category: 'music',
    icon: 'amazonmusic',
    color: '00A8E1',
  },
  {
    id: 'pandora',
    name: 'Pandora',
    category: 'music',
    icon: 'pandora',
    color: '005483',
  },
  {
    id: 'beatport',
    name: 'Beatport',
    category: 'music',
    icon: 'beatport',
    color: 'A3E422',
  },

  // ========================================
  // Social Media Platforms
  // ========================================
  {
    id: 'instagram',
    name: 'Instagram',
    category: 'social',
    icon: 'instagram',
    color: 'E4405F',
  },
  {
    id: 'twitter',
    name: 'Twitter',
    category: 'social',
    icon: 'x',
    color: '000000',
  },
  { id: 'x', name: 'X', category: 'social', icon: 'x', color: '000000' },
  {
    id: 'tiktok',
    name: 'TikTok',
    category: 'social',
    icon: 'tiktok',
    color: '000000',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    category: 'social',
    icon: 'youtube',
    color: 'FF0000',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    category: 'social',
    icon: 'facebook',
    color: '1877F2',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    category: 'social',
    icon: 'linkedin',
    color: '0A66C2',
  },
  {
    id: 'snapchat',
    name: 'Snapchat',
    category: 'social',
    icon: 'snapchat',
    color: 'FFFC00',
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    category: 'social',
    icon: 'pinterest',
    color: 'E60023',
  },
  {
    id: 'reddit',
    name: 'Reddit',
    category: 'social',
    icon: 'reddit',
    color: 'FF4500',
  },

  // ========================================
  // Creator/Content Platforms
  // ========================================
  {
    id: 'twitch',
    name: 'Twitch',
    category: 'creator',
    icon: 'twitch',
    color: '9146FF',
  },
  {
    id: 'discord',
    name: 'Discord',
    category: 'creator',
    icon: 'discord',
    color: '5865F2',
  },
  {
    id: 'patreon',
    name: 'Patreon',
    category: 'creator',
    icon: 'patreon',
    color: 'FF424D',
  },
  {
    id: 'onlyfans',
    name: 'OnlyFans',
    category: 'creator',
    icon: 'onlyfans',
    color: '00AFF0',
  },
  {
    id: 'substack',
    name: 'Substack',
    category: 'creator',
    icon: 'substack',
    color: 'FF6719',
  },
  {
    id: 'medium',
    name: 'Medium',
    category: 'creator',
    icon: 'medium',
    color: '000000',
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'creator',
    icon: 'github',
    color: '181717',
  },
  {
    id: 'behance',
    name: 'Behance',
    category: 'creator',
    icon: 'behance',
    color: '1769FF',
  },
  {
    id: 'dribbble',
    name: 'Dribbble',
    category: 'creator',
    icon: 'dribbble',
    color: 'EA4C89',
  },

  // ========================================
  // Link Aggregators
  // ========================================
  {
    id: 'linktree',
    name: 'Linktree',
    category: 'link_aggregators',
    icon: 'linktree',
    color: '39E09B',
  },
  {
    id: 'beacons',
    name: 'Beacons',
    category: 'link_aggregators',
    icon: 'beacons',
    color: '2BD9FE',
  },
  {
    id: 'linkin_bio',
    name: 'Link in Bio',
    category: 'link_aggregators',
    icon: 'link',
    color: '6B7280',
  },
  {
    id: 'allmylinks',
    name: 'AllMyLinks',
    category: 'link_aggregators',
    icon: 'link',
    color: '6B7280',
  },
  {
    id: 'linkfire',
    name: 'Linkfire',
    category: 'link_aggregators',
    icon: 'linkfire',
    color: 'FF5A3C',
  },
  {
    id: 'toneden',
    name: 'ToneDen',
    category: 'link_aggregators',
    icon: 'link',
    color: '00C7AE',
  },
  {
    id: 'featurefm',
    name: 'Feature.fm',
    category: 'link_aggregators',
    icon: 'link',
    color: 'FF6B35',
  },

  // ========================================
  // Payment/Tip Platforms
  // ========================================
  {
    id: 'venmo',
    name: 'Venmo',
    category: 'payment',
    icon: 'venmo',
    color: '3D95CE',
  },
  {
    id: 'paypal',
    name: 'PayPal',
    category: 'payment',
    icon: 'paypal',
    color: '00457C',
  },
  {
    id: 'cashapp',
    name: 'Cash App',
    category: 'payment',
    icon: 'cashapp',
    color: '00D632',
  },
  {
    id: 'zelle',
    name: 'Zelle',
    category: 'payment',
    icon: 'zelle',
    color: '6D1ED4',
  },
  {
    id: 'ko_fi',
    name: 'Ko-fi',
    category: 'payment',
    icon: 'kofi',
    color: 'FF5E5B',
  },
  {
    id: 'buymeacoffee',
    name: 'Buy Me a Coffee',
    category: 'payment',
    icon: 'buymeacoffee',
    color: 'FFDD00',
  },
  {
    id: 'gofundme',
    name: 'GoFundMe',
    category: 'payment',
    icon: 'gofundme',
    color: '00B964',
  },

  // ========================================
  // Messaging/Communication Platforms
  // ========================================
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    category: 'messaging',
    icon: 'whatsapp',
    color: '25D366',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    category: 'messaging',
    icon: 'telegram',
    color: '26A5E4',
  },
  {
    id: 'signal',
    name: 'Signal',
    category: 'messaging',
    icon: 'signal',
    color: '3A76F0',
  },
  {
    id: 'email',
    name: 'Email',
    category: 'messaging',
    icon: 'mail',
    color: '6B7280',
  },
  {
    id: 'phone',
    name: 'Phone',
    category: 'messaging',
    icon: 'phone',
    color: '6B7280',
  },

  // ========================================
  // Professional Links
  // ========================================
  {
    id: 'website',
    name: 'Website',
    category: 'professional',
    icon: 'globe',
    color: '6B7280',
  },
  {
    id: 'blog',
    name: 'Blog',
    category: 'professional',
    icon: 'rss',
    color: 'FFA500',
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    category: 'professional',
    icon: 'briefcase',
    color: '6B7280',
  },
  {
    id: 'booking',
    name: 'Booking',
    category: 'professional',
    icon: 'calendar',
    color: '6B7280',
  },
  {
    id: 'press_kit',
    name: 'Press Kit',
    category: 'professional',
    icon: 'document',
    color: '6B7280',
  },

  // ========================================
  // Other
  // ========================================
  {
    id: 'other',
    name: 'Other',
    category: 'other',
    icon: 'link',
    color: '6B7280',
  },
] as const satisfies readonly PlatformMetadata[];
