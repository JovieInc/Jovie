export const ARTIST_SEARCH_PLATFORMS = [
  {
    id: 'spotify-artist',
    name: 'Spotify Artist',
    icon: 'spotify',
    searchMode: true,
    provider: 'spotify' as const,
  },
] as const;

export type ArtistSearchProvider =
  (typeof ARTIST_SEARCH_PLATFORMS)[number]['provider'];

export type PlatformCategory = 'music' | 'social' | 'video' | 'other';

type PlatformBase = {
  id: string;
  name: string;
  icon: string;
  prefill: string;
  hint: string;
};

type PlatformConfig = PlatformBase & {
  category: PlatformCategory;
  popular: boolean;
};

const music = (p: PlatformBase, popular = false): PlatformConfig => ({
  ...p,
  category: 'music',
  popular,
});

const social = (p: PlatformBase, popular = false): PlatformConfig => ({
  ...p,
  category: 'social',
  popular,
});

const video = (p: PlatformBase, popular = false): PlatformConfig => ({
  ...p,
  category: 'video',
  popular,
});

const other = (p: PlatformBase, popular = false): PlatformConfig => ({
  ...p,
  category: 'other',
  popular,
});

export const PLATFORM_OPTIONS = [
  music(
    {
      id: 'spotify',
      name: 'Spotify',
      icon: 'spotify',
      prefill: 'https://open.spotify.com/artist/',
      hint: 'artist link',
    },
    true
  ),
  music(
    {
      id: 'apple-music',
      name: 'Apple Music',
      icon: 'applemusic',
      prefill: 'https://music.apple.com/artist/',
      hint: 'artist link',
    },
    true
  ),
  music({
    id: 'youtube-music',
    name: 'YouTube Music',
    icon: 'youtube',
    prefill: 'https://music.youtube.com/channel/',
    hint: 'channel link',
  }),
  social(
    {
      id: 'instagram',
      name: 'Instagram',
      icon: 'instagram',
      prefill: 'https://instagram.com/',
      hint: '@username',
    },
    true
  ),
  social(
    {
      id: 'tiktok',
      name: 'TikTok',
      icon: 'tiktok',
      prefill: 'https://www.tiktok.com/@',
      hint: '@username',
    },
    true
  ),
  video(
    {
      id: 'youtube',
      name: 'YouTube',
      icon: 'youtube',
      prefill: 'https://www.youtube.com/@',
      hint: '@channel',
    },
    true
  ),
  social(
    {
      id: 'twitter',
      name: 'X (Twitter)',
      icon: 'x',
      prefill: 'https://x.com/',
      hint: '@handle',
    },
    true
  ),
  social({
    id: 'facebook',
    name: 'Facebook',
    icon: 'facebook',
    prefill: 'https://facebook.com/',
    hint: '/page',
  }),
  music({
    id: 'soundcloud',
    name: 'SoundCloud',
    icon: 'soundcloud',
    prefill: 'https://soundcloud.com/',
    hint: '/artist',
  }),
  video({
    id: 'twitch',
    name: 'Twitch',
    icon: 'twitch',
    prefill: 'https://twitch.tv/',
    hint: '/channel',
  }),
  social({
    id: 'linkedin',
    name: 'LinkedIn',
    icon: 'linkedin',
    prefill: 'https://linkedin.com/in/',
    hint: '/profile',
  }),
  other({
    id: 'venmo',
    name: 'Venmo',
    icon: 'venmo',
    prefill: 'https://venmo.com/',
    hint: '@username',
  }),
  social({
    id: 'discord',
    name: 'Discord',
    icon: 'discord',
    prefill: 'https://discord.gg/',
    hint: 'invite code',
  }),
  social({
    id: 'threads',
    name: 'Threads',
    icon: 'threads',
    prefill: 'https://threads.net/@',
    hint: '@username',
  }),
  social({
    id: 'telegram',
    name: 'Telegram',
    icon: 'telegram',
    prefill: 'https://t.me/',
    hint: '@username',
  }),
  social({
    id: 'snapchat',
    name: 'Snapchat',
    icon: 'snapchat',
    prefill: 'https://snapchat.com/add/',
    hint: 'username',
  }),
  other(
    {
      id: 'website',
      name: 'Website',
      icon: 'globe',
      prefill: 'https://',
      hint: 'your URL',
    },
    true
  ),
] as const;

export const CATEGORY_LABELS: Record<PlatformCategory, string> = {
  music: 'Music',
  social: 'Social',
  video: 'Video',
  other: 'Other',
};

export const CATEGORY_ORDER: PlatformCategory[] = [
  'social',
  'music',
  'video',
  'other',
];
