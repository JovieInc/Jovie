export function getPlatformIcon(platform: string): string {
  const icons: Record<string, string> = {
    instagram: 'i-simple-icons-instagram',
    twitter: 'i-simple-icons-twitter',
    tiktok: 'i-simple-icons-tiktok',
    youtube: 'i-simple-icons-youtube',
    spotify: 'i-simple-icons-spotify',
    applemusic: 'i-simple-icons-applemusic',
    default: 'i-heroicons-link',
  };

  return icons[platform.toLowerCase()] || icons.default;
}

export function getPlatformName(platform: string): string {
  const names: Record<string, string> = {
    instagram: 'Instagram',
    twitter: 'Twitter',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    spotify: 'Spotify',
    applemusic: 'Apple Music',
    default: 'Link',
  };

  return names[platform.toLowerCase()] || names.default;
}
