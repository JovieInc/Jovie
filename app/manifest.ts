import { MetadataRoute } from 'next';
import { APP_NAME } from '@/constants/app';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} - Link in bio for music artists`,
    short_name: 'Jovie',
    description:
      'Connect your music, social media, and merch in one link. No design needed. Live in under 90 seconds.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff', // white background
    theme_color: '#6366f1', // indigo-500
    orientation: 'portrait',
    scope: '/',
    lang: 'en',
    categories: ['music', 'entertainment', 'social', 'productivity'],
    icons: [
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
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
      {
        src: '/favicon-32x32.png',
        sizes: '32x32',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/favicon-16x16.png',
        sizes: '16x16',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    screenshots: [
      {
        src: '/og/default.png',
        sizes: '1200x630',
        type: 'image/png',
        form_factor: 'wide',
        label: `${APP_NAME} - Link in bio for music artists`,
      },
      {
        src: '/og/default.png',
        sizes: '1200x630',
        type: 'image/png',
        form_factor: 'narrow',
        label: `${APP_NAME} - Link in bio for music artists`,
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
            src: '/favicon-32x32.png',
            sizes: '32x32',
          },
        ],
      },
      {
        name: 'Privacy Policy',
        short_name: 'Privacy',
        description: 'View our privacy policy',
        url: '/legal/privacy',
        icons: [
          {
            src: '/favicon-32x32.png',
            sizes: '32x32',
          },
        ],
      },
      {
        name: 'Terms of Service',
        short_name: 'Terms',
        description: 'View our terms of service',
        url: '/legal/terms',
        icons: [
          {
            src: '/favicon-32x32.png',
            sizes: '32x32',
          },
        ],
      },
    ],
    related_applications: [],
    prefer_related_applications: false,
  };
}
