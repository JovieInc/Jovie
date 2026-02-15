/**
 * UTM Preset Library
 *
 * Comprehensive collection of built-in UTM presets organized by category.
 * These presets cover the most common use cases for music marketing.
 *
 * Presets use {{release_slug}} placeholder for campaign name,
 * which gets resolved at copy-time to the actual release slug.
 */

import type { UTMPreset, UTMPresetCategory } from './types';

/**
 * Social Media presets - for organic social posts
 */
const SOCIAL_PRESETS: UTMPreset[] = [
  {
    id: 'instagram-story',
    label: 'Instagram Story',
    description: 'Swipe-up or link sticker',
    icon: 'Instagram',
    params: {
      utm_source: 'instagram',
      utm_medium: 'social',
      utm_campaign: '{{release_slug}}',
      utm_content: 'story',
    },
  },
  {
    id: 'instagram-bio',
    label: 'Instagram Bio',
    description: 'Link in bio',
    icon: 'Instagram',
    params: {
      utm_source: 'instagram',
      utm_medium: 'social',
      utm_campaign: '{{release_slug}}',
      utm_content: 'bio',
    },
  },
  {
    id: 'instagram-post',
    label: 'Instagram Post',
    description: 'Feed post caption',
    icon: 'Instagram',
    params: {
      utm_source: 'instagram',
      utm_medium: 'social',
      utm_campaign: '{{release_slug}}',
      utm_content: 'post',
    },
  },
  {
    id: 'tiktok-bio',
    label: 'TikTok Bio',
    description: 'Link in TikTok bio',
    icon: 'Music2',
    params: {
      utm_source: 'tiktok',
      utm_medium: 'social',
      utm_campaign: '{{release_slug}}',
      utm_content: 'bio',
    },
  },
  {
    id: 'tiktok-post',
    label: 'TikTok Post',
    description: 'Video description link',
    icon: 'Music2',
    params: {
      utm_source: 'tiktok',
      utm_medium: 'social',
      utm_campaign: '{{release_slug}}',
      utm_content: 'post',
    },
  },
  {
    id: 'tiktok-sound',
    label: 'TikTok Sound Campaign',
    description: 'Influencer use-this-sound link for TikTok',
    icon: 'Music2',
    params: {
      utm_source: 'tiktok',
      utm_medium: 'sound',
      utm_campaign: '{{release_slug}}',
      utm_content: 'use_sound',
    },
  },
  {
    id: 'reels-sound',
    label: 'Instagram Reels Sound',
    description: 'Influencer use-this-sound link for Reels',
    icon: 'Instagram',
    params: {
      utm_source: 'instagram',
      utm_medium: 'sound',
      utm_campaign: '{{release_slug}}',
      utm_content: 'use_sound',
    },
  },
  {
    id: 'shorts-sound',
    label: 'YouTube Shorts Sound',
    description: 'Influencer use-this-sound link for Shorts',
    icon: 'Youtube',
    params: {
      utm_source: 'youtube',
      utm_medium: 'sound',
      utm_campaign: '{{release_slug}}',
      utm_content: 'use_sound',
    },
  },
  {
    id: 'twitter-post',
    label: 'Twitter/X Post',
    description: 'Tweet with link',
    icon: 'Twitter',
    params: {
      utm_source: 'twitter',
      utm_medium: 'social',
      utm_campaign: '{{release_slug}}',
      utm_content: 'post',
    },
  },
  {
    id: 'twitter-bio',
    label: 'Twitter/X Bio',
    description: 'Profile link',
    icon: 'Twitter',
    params: {
      utm_source: 'twitter',
      utm_medium: 'social',
      utm_campaign: '{{release_slug}}',
      utm_content: 'bio',
    },
  },
  {
    id: 'facebook-post',
    label: 'Facebook Post',
    description: 'Page or profile post',
    icon: 'Facebook',
    params: {
      utm_source: 'facebook',
      utm_medium: 'social',
      utm_campaign: '{{release_slug}}',
      utm_content: 'post',
    },
  },
  {
    id: 'youtube-description',
    label: 'YouTube Description',
    description: 'Video description link',
    icon: 'Youtube',
    params: {
      utm_source: 'youtube',
      utm_medium: 'social',
      utm_campaign: '{{release_slug}}',
      utm_content: 'description',
    },
  },
  {
    id: 'youtube-community',
    label: 'YouTube Community',
    description: 'Community tab post',
    icon: 'Youtube',
    params: {
      utm_source: 'youtube',
      utm_medium: 'social',
      utm_campaign: '{{release_slug}}',
      utm_content: 'community',
    },
  },
  {
    id: 'threads-post',
    label: 'Threads Post',
    icon: 'AtSign',
    params: {
      utm_source: 'threads',
      utm_medium: 'social',
      utm_campaign: '{{release_slug}}',
      utm_content: 'post',
    },
  },
  {
    id: 'discord-server',
    label: 'Discord Server',
    description: 'Server announcement',
    icon: 'MessageCircle',
    params: {
      utm_source: 'discord',
      utm_medium: 'social',
      utm_campaign: '{{release_slug}}',
      utm_content: 'server',
    },
  },
  {
    id: 'reddit-post',
    label: 'Reddit Post',
    icon: 'Hash',
    params: {
      utm_source: 'reddit',
      utm_medium: 'social',
      utm_campaign: '{{release_slug}}',
      utm_content: 'post',
    },
  },
  {
    id: 'snapchat-story',
    label: 'Snapchat Story',
    icon: 'Ghost',
    params: {
      utm_source: 'snapchat',
      utm_medium: 'social',
      utm_campaign: '{{release_slug}}',
      utm_content: 'story',
    },
  },
  {
    id: 'linkedin-post',
    label: 'LinkedIn Post',
    icon: 'Linkedin',
    params: {
      utm_source: 'linkedin',
      utm_medium: 'social',
      utm_campaign: '{{release_slug}}',
      utm_content: 'post',
    },
  },
];

/**
 * Email & Newsletter presets
 */
const EMAIL_PRESETS: UTMPreset[] = [
  {
    id: 'newsletter',
    label: 'Newsletter',
    description: 'Regular fan newsletter',
    icon: 'Mail',
    params: {
      utm_source: 'newsletter',
      utm_medium: 'email',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'fan-blast',
    label: 'Fan Email Blast',
    description: 'One-time announcement',
    icon: 'Send',
    params: {
      utm_source: 'email_blast',
      utm_medium: 'email',
      utm_campaign: '{{release_slug}}',
      utm_content: 'announcement',
    },
  },
  {
    id: 'pr-email',
    label: 'PR Email',
    description: 'Press outreach',
    icon: 'Newspaper',
    params: {
      utm_source: 'pr',
      utm_medium: 'email',
      utm_campaign: '{{release_slug}}',
      utm_content: 'press',
    },
  },
  {
    id: 'playlist-pitch',
    label: 'Playlist Pitch',
    description: 'Curator outreach',
    icon: 'ListMusic',
    params: {
      utm_source: 'playlist_pitch',
      utm_medium: 'email',
      utm_campaign: '{{release_slug}}',
      utm_content: 'curator',
    },
  },
  {
    id: 'label-promo',
    label: 'Label Promo',
    description: 'Label distribution email',
    icon: 'Building2',
    params: {
      utm_source: 'label',
      utm_medium: 'email',
      utm_campaign: '{{release_slug}}',
      utm_content: 'promo',
    },
  },
  {
    id: 'collab-outreach',
    label: 'Collaboration Outreach',
    description: 'Artist collaboration email',
    icon: 'Users',
    params: {
      utm_source: 'collab',
      utm_medium: 'email',
      utm_campaign: '{{release_slug}}',
      utm_content: 'outreach',
    },
  },
];

/**
 * Paid Advertising presets
 */
const PAID_PRESETS: UTMPreset[] = [
  {
    id: 'meta-ads',
    label: 'Meta Ads (FB/IG)',
    description: 'Facebook & Instagram ads',
    icon: 'Target',
    params: {
      utm_source: 'meta',
      utm_medium: 'paid_social',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'instagram-ads',
    label: 'Instagram Ads',
    icon: 'Instagram',
    params: {
      utm_source: 'instagram',
      utm_medium: 'paid_social',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'facebook-ads',
    label: 'Facebook Ads',
    icon: 'Facebook',
    params: {
      utm_source: 'facebook',
      utm_medium: 'paid_social',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'tiktok-ads',
    label: 'TikTok Ads',
    icon: 'Music2',
    params: {
      utm_source: 'tiktok',
      utm_medium: 'paid_social',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'google-ads',
    label: 'Google Ads',
    icon: 'Search',
    params: {
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'youtube-ads',
    label: 'YouTube Ads',
    icon: 'Youtube',
    params: {
      utm_source: 'youtube',
      utm_medium: 'paid_video',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'spotify-marquee',
    label: 'Spotify Marquee',
    description: 'Spotify in-app promotion',
    icon: 'Music',
    params: {
      utm_source: 'spotify',
      utm_medium: 'marquee',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'spotify-discovery',
    label: 'Spotify Discovery Mode',
    icon: 'Music',
    params: {
      utm_source: 'spotify',
      utm_medium: 'discovery_mode',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'twitter-ads',
    label: 'Twitter/X Ads',
    icon: 'Twitter',
    params: {
      utm_source: 'twitter',
      utm_medium: 'paid_social',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'reddit-ads',
    label: 'Reddit Ads',
    icon: 'Hash',
    params: {
      utm_source: 'reddit',
      utm_medium: 'paid_social',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'influencer-paid',
    label: 'Influencer (Paid)',
    description: 'Paid influencer promotion',
    icon: 'Star',
    params: {
      utm_source: 'influencer',
      utm_medium: 'paid',
      utm_campaign: '{{release_slug}}',
    },
  },
];

/**
 * Music Platform presets
 */
const MUSIC_PRESETS: UTMPreset[] = [
  {
    id: 'spotify-profile',
    label: 'Spotify Artist Profile',
    icon: 'Music',
    params: {
      utm_source: 'spotify',
      utm_medium: 'profile',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'apple-music-profile',
    label: 'Apple Music Profile',
    icon: 'Apple',
    params: {
      utm_source: 'apple_music',
      utm_medium: 'profile',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'linktree',
    label: 'Linktree / Bio Link',
    description: 'Any bio link service',
    icon: 'Link',
    params: {
      utm_source: 'linktree',
      utm_medium: 'bio_link',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'press-kit',
    label: 'Electronic Press Kit',
    icon: 'FileText',
    params: {
      utm_source: 'epk',
      utm_medium: 'press',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'bandcamp-profile',
    label: 'Bandcamp Profile',
    icon: 'Store',
    params: {
      utm_source: 'bandcamp',
      utm_medium: 'profile',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'soundcloud-profile',
    label: 'SoundCloud Profile',
    icon: 'Cloud',
    params: {
      utm_source: 'soundcloud',
      utm_medium: 'profile',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'artist-website',
    label: 'Artist Website',
    icon: 'Globe',
    params: {
      utm_source: 'website',
      utm_medium: 'organic',
      utm_campaign: '{{release_slug}}',
    },
  },
];

/**
 * Other/Miscellaneous presets
 */
const OTHER_PRESETS: UTMPreset[] = [
  {
    id: 'qr-print',
    label: 'QR Code (Print)',
    description: 'Posters, flyers, merch',
    icon: 'QrCode',
    params: {
      utm_source: 'qr_code',
      utm_medium: 'print',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'qr-digital',
    label: 'QR Code (Digital)',
    description: 'Digital screens, presentations',
    icon: 'QrCode',
    params: {
      utm_source: 'qr_code',
      utm_medium: 'digital',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'sms',
    label: 'SMS / Text Message',
    icon: 'MessageSquare',
    params: {
      utm_source: 'sms',
      utm_medium: 'text',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'podcast',
    label: 'Podcast Show Notes',
    icon: 'Headphones',
    params: {
      utm_source: 'podcast',
      utm_medium: 'audio',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'podcast-ad',
    label: 'Podcast Ad Read',
    icon: 'Mic',
    params: {
      utm_source: 'podcast',
      utm_medium: 'ad',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'website-banner',
    label: 'Website Banner',
    icon: 'PanelTop',
    params: {
      utm_source: 'website',
      utm_medium: 'banner',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'website-popup',
    label: 'Website Popup',
    icon: 'Square',
    params: {
      utm_source: 'website',
      utm_medium: 'popup',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'live-show',
    label: 'Live Show Announcement',
    icon: 'Ticket',
    params: {
      utm_source: 'live_show',
      utm_medium: 'announcement',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'merch-insert',
    label: 'Merch Insert/Card',
    icon: 'Package',
    params: {
      utm_source: 'merch',
      utm_medium: 'insert',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'collab-partner',
    label: 'Collaboration Partner',
    description: 'Cross-promotion with another artist',
    icon: 'Users',
    params: {
      utm_source: 'collab',
      utm_medium: 'partner',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'referral',
    label: 'Referral / Word of Mouth',
    icon: 'Share2',
    params: {
      utm_source: 'referral',
      utm_medium: 'organic',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'blog-feature',
    label: 'Blog Feature',
    icon: 'BookOpen',
    params: {
      utm_source: 'blog',
      utm_medium: 'organic',
      utm_campaign: '{{release_slug}}',
    },
  },
  {
    id: 'radio-interview',
    label: 'Radio Interview',
    icon: 'Radio',
    params: {
      utm_source: 'radio',
      utm_medium: 'interview',
      utm_campaign: '{{release_slug}}',
    },
  },
];

/**
 * All UTM preset categories
 */
export const UTM_PRESET_CATEGORIES: UTMPresetCategory[] = [
  {
    id: 'social',
    label: 'Social Media',
    icon: 'Share2',
    presets: SOCIAL_PRESETS,
  },
  {
    id: 'email',
    label: 'Email & Newsletters',
    icon: 'Mail',
    presets: EMAIL_PRESETS,
  },
  {
    id: 'paid',
    label: 'Paid Advertising',
    icon: 'DollarSign',
    presets: PAID_PRESETS,
  },
  {
    id: 'music',
    label: 'Music Platforms',
    icon: 'Music',
    presets: MUSIC_PRESETS,
  },
  {
    id: 'other',
    label: 'Other',
    icon: 'MoreHorizontal',
    presets: OTHER_PRESETS,
  },
];

/**
 * Flat list of all presets (for search)
 */
export const ALL_UTM_PRESETS: UTMPreset[] = UTM_PRESET_CATEGORIES.flatMap(
  category => category.presets
);

/**
 * Map of preset ID to preset (for quick lookup)
 */
export const UTM_PRESET_MAP: Record<string, UTMPreset> = Object.fromEntries(
  ALL_UTM_PRESETS.map(preset => [preset.id, preset])
);

/**
 * Map of preset ID to its category ID
 */
export const UTM_PRESET_CATEGORY_MAP: Record<string, string> =
  Object.fromEntries(
    UTM_PRESET_CATEGORIES.flatMap(category =>
      category.presets.map(preset => [preset.id, category.id])
    )
  );

/**
 * Common UTM source values for autocomplete
 */
export const COMMON_UTM_SOURCES = [
  'instagram',
  'tiktok',
  'twitter',
  'facebook',
  'youtube',
  'newsletter',
  'email_blast',
  'spotify',
  'apple_music',
  'google',
  'meta',
  'qr_code',
  'website',
  'podcast',
  'pr',
  'influencer',
  'referral',
  'discord',
  'reddit',
  'threads',
  'linktree',
  'sms',
] as const;

/**
 * Common UTM medium values for autocomplete
 */
export const COMMON_UTM_MEDIUMS = [
  'social',
  'email',
  'paid_social',
  'cpc',
  'paid_video',
  'organic',
  'referral',
  'display',
  'banner',
  'print',
  'audio',
  'video',
  'profile',
  'bio_link',
  'partner',
  'press',
  'marquee',
  'discovery_mode',
  'text',
  'ad',
  'sound',
] as const;

/**
 * Get default presets for quick access (most commonly used)
 */
export function getDefaultQuickPresets(): UTMPreset[] {
  return [
    UTM_PRESET_MAP['instagram-story'],
    UTM_PRESET_MAP['instagram-bio'],
    UTM_PRESET_MAP['tiktok-bio'],
    UTM_PRESET_MAP['twitter-post'],
    UTM_PRESET_MAP['newsletter'],
  ].filter(Boolean);
}

/**
 * Search presets by query
 * Searches label, description, and source/medium values
 */
export function searchPresets(query: string): UTMPreset[] {
  if (!query.trim()) {
    return ALL_UTM_PRESETS;
  }

  const normalizedQuery = query.toLowerCase().trim();

  return ALL_UTM_PRESETS.filter(preset => {
    const searchableText = [
      preset.label,
      preset.description,
      preset.params.utm_source,
      preset.params.utm_medium,
      preset.params.utm_content,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}

/**
 * Get presets by category ID
 */
export function getPresetsByCategory(categoryId: string): UTMPreset[] {
  const category = UTM_PRESET_CATEGORIES.find(c => c.id === categoryId);
  return category?.presets ?? [];
}
