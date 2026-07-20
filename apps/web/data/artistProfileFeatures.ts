import { getMarketingExportImage } from '@/lib/screenshots/registry';
import type { MarketingFeatureTile } from './marketingFeatureTiles';

export type ArtistProfileFeatureTile = MarketingFeatureTile;

// Homepage v2 still consumes this richer visual grid. Keep it separate from
// the compact artist-profiles truth wall so the two surfaces can evolve
// without silently changing each other's layout contract.
export const ARTIST_PROFILE_SPEC_TILES: readonly ArtistProfileFeatureTile[] = [
  {
    id: 'audience-quality-filtering',
    title: 'Audience Quality Filtering',
    body: 'Jovie identifies bots, your own team, and test traffic so your fan metrics measure actual fans.',
    size: 'large',
    accent: 'blue',
    layoutClassName:
      'xl:col-start-1 xl:row-start-1 xl:col-span-5 xl:row-span-2',
    visual: 'audience-quality-filter',
  },
  {
    id: 'rich-analytics',
    title: 'Rich Analytics',
    body: 'See the top-line signals fast without digging through extra dashboard noise.',
    size: 'small',
    accent: 'blue',
    layoutClassName:
      'xl:col-start-1 xl:row-start-3 xl:col-span-3 xl:row-span-1',
    visual: 'icon-badge',
    badgeIcon: 'chart',
    badgeLabel: 'Analytics at a glance',
  },
  {
    id: 'geo-insights',
    title: 'Geo Insights',
    body: 'See where attention is building before you book, announce, or spend.',
    size: 'large',
    accent: 'orange',
    layoutClassName:
      'xl:col-start-6 xl:row-start-1 xl:col-span-4 xl:row-span-2',
    visual: 'cropped-screenshot',
    screenshotSrc: getMarketingExportImage('artist-spec-geo-insights-desktop')
      .publicUrl,
    screenshotAlt: 'Jovie geo insights showing the top cities list.',
    screenshotWidth: 403,
    screenshotHeight: 946,
    frameClassName: 'min-h-[11.5rem] xl:min-h-[14rem]',
    imageClassName: 'object-cover object-top',
    objectPosition: 'center top',
  },
  {
    id: 'always-in-sync',
    title: 'Always in Sync',
    body: 'New music and profile surfaces stay current automatically without manual rebuilding.',
    size: 'small',
    accent: 'pink',
    layoutClassName:
      'xl:col-start-10 xl:row-start-1 xl:col-span-3 xl:row-span-1',
    visual: 'icon-badge',
    badgeIcon: 'sync',
    badgeLabel: 'Profiles stay current',
  },
  {
    id: 'activate-creators',
    title: 'Activate Creators',
    body: 'Give fans and creators one obvious path to use the sound and post.',
    accent: 'green',
    size: 'small',
    layoutClassName:
      'xl:col-start-4 xl:row-start-3 xl:col-span-3 xl:row-span-1',
    visual: 'button-chip',
    chipIcon: 'sound',
    chipLabel: 'Use This Sound',
  },
  {
    id: 'press-ready-assets',
    title: 'Press-Ready Assets',
    body: 'Promoters, media, and partners can grab approved photos without back-and-forth.',
    size: 'small',
    accent: 'red',
    layoutClassName:
      'xl:col-start-1 xl:row-start-4 xl:col-span-6 xl:row-span-1',
    visual: 'button-chip',
    chipIcon: 'download',
    chipLabel: 'Download Press Photos',
  },
  {
    id: 'utm-builder',
    title: 'UTM Builder',
    body: 'Build tracked share links from the same share flow you already use.',
    size: 'large',
    accent: 'teal',
    layoutClassName:
      'xl:col-start-7 xl:row-start-3 xl:col-span-6 xl:row-span-2',
    visual: 'mock-popover',
    popoverLabel: 'Tracked links',
    popoverItems: [
      'Instagram bio',
      'Tour poster QR',
      'Release week ad set',
      'Creator outreach',
    ],
  },
  {
    id: 'blazing-fast',
    title: 'Blazing Fast',
    body: 'A slow profile kills conversions. Jovie is built to a much higher speed bar than a typical link-in-bio page.',
    size: 'small',
    accent: 'purple',
    layoutClassName:
      'xl:col-start-10 xl:row-start-2 xl:col-span-3 xl:row-span-1',
    visual: 'icon-badge',
    badgeIcon: 'speed',
    badgeLabel: 'Fast by default',
  },
];

export interface ArtistProfileTruthTile {
  readonly id:
    | 'fast-load'
    | 'smart-routing'
    | 'deep-link-modes'
    | 'release-pages'
    | 'tour-dates'
    | 'pay'
    | 'fan-capture'
    | 'notifications'
    | 'qr-sharing'
    | 'lightweight-analytics';
  readonly title: string;
  readonly body: string;
}

export const ARTIST_PROFILE_TRUTH_TILES: readonly ArtistProfileTruthTile[] = [
  {
    id: 'fast-load',
    title: 'Fast load',
    body: 'Built to open quickly when attention is thin.',
  },
  {
    id: 'smart-routing',
    title: 'Smart routing',
    body: 'Send each fan to the right destination with less friction.',
  },
  {
    id: 'deep-link-modes',
    title: 'Deep-link modes',
    body: 'Listen, tour, support, and subscribe all live behind one profile.',
  },
  {
    id: 'release-pages',
    title: 'Release pages + countdowns',
    body: 'Give every release a clean destination before and after the drop.',
  },
  {
    id: 'tour-dates',
    title: 'Tour dates',
    body: 'Show nearby dates first and keep ticket intent close.',
  },
  {
    id: 'pay',
    title: 'Pay',
    body: 'Turn support moments into action without breaking the flow.',
  },
  {
    id: 'fan-capture',
    title: 'Fan capture',
    body: 'Move from anonymous traffic to an owned audience.',
  },
  {
    id: 'notifications',
    title: 'Notifications',
    body: 'Give fans a simple way to stay in the loop.',
  },
  {
    id: 'qr-sharing',
    title: 'QR sharing',
    body: 'Put one scan on a flyer, merch table, or venue wall.',
  },
  {
    id: 'lightweight-analytics',
    title: 'Views, clicks, referrers',
    body: 'Keep a lightweight read on what is working.',
  },
] as const;
