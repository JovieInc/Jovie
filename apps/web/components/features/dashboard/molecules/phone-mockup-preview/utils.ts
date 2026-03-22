export function getPlatformName(platform: string): string {
  const names: Record<string, string> = {
    instagram: 'Instagram',
    twitter: 'Twitter',
    x: 'X',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    spotify: 'Spotify',
    applemusic: 'Apple Music',
    default: 'Link',
  };

  return names[platform.toLowerCase()] || names.default;
}
