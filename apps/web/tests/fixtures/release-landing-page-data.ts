export const defaultProps = {
  release: {
    title: 'Midnight Drive',
    artworkUrl: 'https://example.com/art.jpg',
    releaseDate: '2026-05-01',
  },
  artist: {
    name: 'Tim White',
    handle: 'timwhite',
    avatarUrl: 'https://example.com/avatar.jpg',
  },
  providers: [
    {
      key: 'spotify' as const,
      label: 'Spotify',
      accent: '#1DB954',
      url: 'https://open.spotify.com/track/1',
      confidence: undefined,
    },
    {
      key: 'apple_music' as const,
      label: 'Apple Music',
      accent: '#FA2D48',
      url: 'https://music.apple.com/track/1',
      confidence: undefined,
    },
  ],
};
