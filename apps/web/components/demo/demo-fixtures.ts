import type { DemoRelease } from './demo-types';

export const DEMO_RELEASES: DemoRelease[] = [
  {
    id: 'rel-01',
    title: 'Night Drive',
    artist: 'Sora Vale',
    releaseDate: '2026-02-18',
    status: 'healthy',
    note: 'All providers synced and storefronts are live.',
    links: [
      { id: 'sp-01', provider: 'Spotify', status: 'connected', url: '#' },
      { id: 'am-01', provider: 'Apple Music', status: 'connected', url: '#' },
      { id: 'yt-01', provider: 'YouTube Music', status: 'connected', url: '#' },
    ],
  },
  {
    id: 'rel-02',
    title: 'Static Skies',
    artist: 'Sora Vale',
    releaseDate: '2026-01-30',
    status: 'warning',
    note: 'Apple Music link is missing and requires attention.',
    links: [
      { id: 'sp-02', provider: 'Spotify', status: 'connected', url: '#' },
      { id: 'am-02', provider: 'Apple Music', status: 'missing' },
      { id: 'yt-02', provider: 'YouTube Music', status: 'connected', url: '#' },
    ],
  },
  {
    id: 'rel-03',
    title: 'Low Orbit',
    artist: 'Sora Vale',
    releaseDate: '2025-12-04',
    status: 'error',
    note: 'Spotify sync is stale and needs a manual refresh.',
    links: [
      { id: 'sp-03', provider: 'Spotify', status: 'stale' },
      { id: 'am-03', provider: 'Apple Music', status: 'connected', url: '#' },
      { id: 'yt-03', provider: 'YouTube Music', status: 'connected', url: '#' },
    ],
  },
  {
    id: 'rel-04',
    title: 'Manual Sunset',
    artist: 'Sora Vale',
    releaseDate: 'Draft',
    status: 'draft',
    note: 'Draft release created manually. Publish when metadata is complete.',
    links: [
      { id: 'sp-04', provider: 'Spotify', status: 'missing' },
      { id: 'am-04', provider: 'Apple Music', status: 'missing' },
      { id: 'yt-04', provider: 'YouTube Music', status: 'missing' },
    ],
  },
];
