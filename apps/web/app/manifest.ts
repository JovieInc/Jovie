import type { MetadataRoute } from 'next';
import { APP_NAME } from '@/constants/app';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} - Artist profiles for music artists`,
    short_name: 'Jovie',
    description:
      'Connect your music, social media, and merch in one link. No design needed. Live in under 90 seconds.',
    id: '/',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    orientation: 'portrait',
    scope: '/',
    lang: 'en',
    categories: ['music', 'entertainment', 'social', 'productivity'],
    icons: [
      {
        src: '/favicon-96x96.png',
        sizes: '96x96',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/web-app-manifest-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/web-app-manifest-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    screenshots: [
      {
        src: '/web-app-manifest-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        form_factor: 'narrow',
        label: `${APP_NAME} - Artist profiles for music artists`,
      },
    ],
    shortcuts: [
      {
        name: 'Find Artist',
        short_name: 'Search',
        description: 'Search for an artist to claim their profile',
        url: '/',
        icons: [
          {
            src: '/favicon-96x96.png',
            sizes: '96x96',
          },
        ],
      },
    ],
    related_applications: [],
    prefer_related_applications: false,
  };
}
