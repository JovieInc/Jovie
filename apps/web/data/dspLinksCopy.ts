import { APP_ROUTES } from '@/constants/routes';

/**
 * Deterministic rows for the live DSP list on /product/dsp-links.
 * Pandora's find URL is the shipped search template for that service.
 */
export const DSP_LINKS_FIXTURE = {
  findQuery: 'night bus',
  findUrl: 'https://www.pandora.com/search/night%20bus/tracks',
  services: [
    {
      key: 'spotify',
      label: 'Spotify',
      href: 'https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh',
    },
    {
      key: 'tidal',
      label: 'Tidal',
      href: 'https://tidal.com/browse/track/77611316',
    },
    {
      key: 'deezer',
      label: 'Deezer',
      href: 'https://www.deezer.com/track/3135556',
    },
    {
      key: 'pandora',
      label: 'Pandora',
      href: null,
    },
  ],
} as const;

export const DSP_LINKS_COPY = {
  seo: {
    title: 'DSP links',
    description:
      'One outbound link per service. A saved URL opens that service. A service without a URL stays on Find until a URL is saved.',
  },
  headline: 'DSP links',
  support:
    'One outbound link per service. A saved URL opens that service. A service without a URL stays on Find until a URL is saved.',
  links: [
    { href: APP_ROUTES.PRODUCT, label: 'Product' },
    { href: APP_ROUTES.SMART_LINKS, label: 'Smart Links' },
    { href: APP_ROUTES.PRICING, label: 'Pricing' },
    { href: APP_ROUTES.CARD, label: 'Jovie Card' },
  ],
} as const;
