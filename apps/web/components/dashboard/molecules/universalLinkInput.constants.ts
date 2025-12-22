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

export const PLATFORM_OPTIONS = [
  {
    id: 'spotify',
    name: 'Spotify',
    icon: 'spotify',
    prefill: 'https://open.spotify.com/artist/',
  },
  {
    id: 'apple-music',
    name: 'Apple Music',
    icon: 'applemusic',
    prefill: 'https://music.apple.com/artist/',
  },
  {
    id: 'youtube-music',
    name: 'YouTube Music',
    icon: 'youtube',
    prefill: 'https://music.youtube.com/channel/',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: 'instagram',
    prefill: 'https://instagram.com/',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: 'tiktok',
    prefill: 'https://www.tiktok.com/@',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    icon: 'youtube',
    prefill: 'https://www.youtube.com/@',
  },
  { id: 'twitter', name: 'X (Twitter)', icon: 'x', prefill: 'https://x.com/' },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: 'facebook',
    prefill: 'https://facebook.com/',
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    icon: 'soundcloud',
    prefill: 'https://soundcloud.com/',
  },
  {
    id: 'twitch',
    name: 'Twitch',
    icon: 'twitch',
    prefill: 'https://twitch.tv/',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: 'linkedin',
    prefill: 'https://linkedin.com/in/',
  },
  { id: 'venmo', name: 'Venmo', icon: 'venmo', prefill: 'https://venmo.com/' },
  {
    id: 'discord',
    name: 'Discord',
    icon: 'discord',
    prefill: 'https://discord.gg/',
  },
  {
    id: 'threads',
    name: 'Threads',
    icon: 'threads',
    prefill: 'https://threads.net/@',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    icon: 'telegram',
    prefill: 'https://t.me/',
  },
  {
    id: 'snapchat',
    name: 'Snapchat',
    icon: 'snapchat',
    prefill: 'https://snapchat.com/add/',
  },
  { id: 'website', name: 'Website', icon: 'globe', prefill: 'https://' },
] as const;
