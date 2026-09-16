import type { MetadataRoute } from 'next';
import { APP_NAME } from '@/constants/app';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — ${COMPANY_IDENTITY.headline.replace(/\.$/, '')}`,
    short_name: 'Jovie',
    description: COMPANY_IDENTITY.seoDescription,
    id: '/',
    start_url: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    orientation: 'portrait',
    scope: '/',
    lang: 'en',
    categories: ['productivity', 'social', 'business', 'entertainment'],
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
    shortcuts: [
      {
        name: 'Find yourself',
        short_name: 'Search',
        description: 'Search your name and see what the internet knows',
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
