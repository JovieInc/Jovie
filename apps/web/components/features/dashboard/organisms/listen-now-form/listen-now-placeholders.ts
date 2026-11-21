/** Placeholder URLs for music platforms. */
export const DSP_PLACEHOLDERS: Record<string, string> = {
  spotify: 'https://open.spotify.com/artist/...',
  apple_music: 'https://music.apple.com/artist/...',
  youtube: 'https://youtube.com/@yourchannel',
  youtube_music: 'https://music.youtube.com/channel/...',
  soundcloud: 'https://soundcloud.com/yourprofile',
  bandcamp: 'https://yourname.bandcamp.com',
  tidal: 'https://tidal.com/artist/...',
  deezer: 'https://deezer.com/artist/...',
  amazon_music: 'https://music.amazon.com/artists/...',
  pandora: 'https://pandora.com/artist/...',
  beatport: 'https://beatport.com/artist/...',
};

export function getPlaceholder(platform: string): string {
  return DSP_PLACEHOLDERS[platform] || 'https://...';
}
