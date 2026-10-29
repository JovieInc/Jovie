import type { SiteChrome } from './site-chrome';

// Pure data, no zod or copy linter: public header, footer and nav import this.

/** The code default: what the site shows before anything is published. */
export const DEFAULT_SITE_CHROME: SiteChrome = {
  nav: {
    primary: [
      { id: 'product', label: 'Product', href: '/product' },
      { id: 'pricing', label: 'Pricing', href: '/pricing' },
    ],
    customers: [
      { id: 'artists', label: 'Artists', href: '/solutions/artists' },
    ],
  },
  footer: {
    columns: [
      {
        id: 'product',
        title: 'Product',
        links: [
          {
            id: 'artist-profiles',
            label: 'Artist profiles',
            href: '/artist-profiles',
          },
          { id: 'smart-links', label: 'Smart links', href: '/smart-links' },
          { id: 'pre-save', label: 'Pre-save', href: '/product/pre-save' },
          {
            id: 'link-analytics',
            label: 'Link analytics',
            href: '/product/link-analytics',
          },
          {
            id: 'notifications',
            label: 'Notifications',
            href: '/artist-notifications',
          },
          { id: 'pay', label: 'Pay', href: '/pay' },
          { id: 'pricing', label: 'Pricing', href: '/pricing' },
        ],
      },
      {
        id: 'company',
        title: 'Company',
        links: [
          { id: 'about', label: 'About', href: '/about' },
          { id: 'blog', label: 'Blog', href: '/blog' },
          { id: 'changelog', label: 'Changelog', href: '/changelog' },
          {
            id: 'instagram',
            label: 'Instagram',
            href: 'https://instagram.com/meetjovie',
          },
          { id: 'x', label: 'X', href: 'https://x.com/meetjovie' },
        ],
      },
      {
        id: 'resources',
        title: 'Resources',
        links: [
          { id: 'support', label: 'Support', href: '/support' },
          { id: 'developers', label: 'Developers', href: '/developers' },
          { id: 'download', label: 'Download', href: '/download' },
        ],
      },
    ],
    legal: [
      { id: 'privacy', label: 'Privacy', href: '/legal/privacy' },
      { id: 'terms', label: 'Terms', href: '/legal/terms' },
    ],
  },
};

export function isExternalChromeHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}
