import type { MarketingFeatureTile } from './marketingFeatureTiles';

export type ArtistProfileFeaturePlacement = 'section' | 'card' | 'spec tile';

export interface ArtistProfileLaunchFeature {
  readonly feature: string;
  readonly benefit: string;
  readonly uiSurface: string;
  readonly copyCandidate: string;
  readonly placement: ArtistProfileFeaturePlacement;
}

export type ArtistProfileFeatureTile = MarketingFeatureTile;

export const ARTIST_PROFILE_LAUNCH_FEATURES: readonly ArtistProfileLaunchFeature[] =
  [
    {
      feature: 'Adaptive profile',
      benefit:
        'One link can match the moment instead of forcing fans through a static page.',
      uiSurface: 'Pinned phone mode switcher',
      copyCandidate: 'One profile that changes job as the moment changes.',
      placement: 'section',
    },
    {
      feature: 'Speed',
      benefit: 'Fewer drop-offs when attention is thin.',
      uiSurface: 'Hero render and spec wall',
      copyCandidate: 'Fast enough to keep the tap alive.',
      placement: 'spec tile',
    },
    {
      feature: 'Conversion-focused design',
      benefit: 'Fans know what to do next without extra decisions.',
      uiSurface: 'Hero and spec wall',
      copyCandidate: 'Built to convert, not decorate.',
      placement: 'section',
    },
    {
      feature: 'Intelligent routing',
      benefit: 'Fans reach the right service faster.',
      uiSurface: 'Built for artists card',
      copyCandidate: 'Send each fan where they are most likely to listen.',
      placement: 'card',
    },
    {
      feature: 'Deep-link modes',
      benefit:
        'One profile can handle listen, tour, support, and subscribe states.',
      uiSurface: 'Mode switcher',
      copyCandidate:
        'Listen, tour, support, and subscribe all live behind one profile.',
      placement: 'section',
    },
    {
      feature: 'Release and countdown pages',
      benefit: 'Artists can use the same profile before and after the drop.',
      uiSurface: 'Upcoming Release mode and release tiles',
      copyCandidate: 'Before release day, the profile becomes a countdown.',
      placement: 'card',
    },
    {
      feature: 'Shows and tickets',
      benefit: 'Touring fans see nearby show intent faster.',
      uiSurface: 'Touring mode and outcome card',
      copyCandidate: 'Nearby dates come first.',
      placement: 'card',
    },
    {
      feature: 'Pay and support',
      benefit: 'Support moments do not require another disconnected tool.',
      uiSurface: 'Live Support mode and pay tile',
      copyCandidate: 'One scan can become support and fan capture.',
      placement: 'card',
    },
    {
      feature: 'Fan capture',
      benefit: 'Traffic can become an owned audience.',
      uiSurface: 'Capture section and fan capture tile',
      copyCandidate: 'Capture the fan, not just the click.',
      placement: 'section',
    },
    {
      feature: 'Notifications',
      benefit: 'Fans can stay in the loop after they opt in once.',
      uiSurface: 'Capture section and notifications tile',
      copyCandidate: 'Fans opt in once and stay close.',
      placement: 'card',
    },
    {
      feature: 'QR sharing',
      benefit: 'Offline moments can route into the same profile system.',
      uiSurface: 'Built for artists card',
      copyCandidate: 'Put one scan on the table, wall, or flyer.',
      placement: 'card',
    },
    {
      feature: 'Fast launch',
      benefit: 'Artists do not need a builder workflow to publish.',
      uiSurface: 'How It Works strip',
      copyCandidate: 'Claim it, connect it, share it.',
      placement: 'section',
    },
  ] as const;

export const ARTIST_PROFILE_SPEC_TILES: readonly ArtistProfileFeatureTile[] = [
  {
    id: 'rich-analytics',
    title: 'Rich Analytics',
    body: 'See the top-line signals fast without digging through extra dashboard noise.',
    size: 'large',
    accent: 'blue',
    layoutClassName:
      'xl:col-start-1 xl:row-start-1 xl:col-span-5 xl:row-span-2',
    visual: 'cropped-screenshot',
    screenshotSrc: '/product-screenshots/artist-spec-rich-analytics-panel.png',
    screenshotAlt: 'Rich analytics funnel preview',
    screenshotWidth: 344,
    screenshotHeight: 540,
    frameClassName:
      'aspect-[1.58/1] min-h-[11.5rem] md:aspect-[1.64/1] xl:min-h-[12.5rem]',
    imageClassName: 'object-top',
    objectPosition: 'center top',
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
    screenshotSrc: '/product-screenshots/artist-spec-geo-insights-desktop.png',
    screenshotAlt: 'Jovie geo insights showing the top cities list.',
    screenshotWidth: 344,
    screenshotHeight: 540,
    frameClassName:
      'aspect-[1.14/1] min-h-[11.5rem] md:aspect-[1.18/1] xl:min-h-[12.5rem]',
    imageClassName: 'object-top',
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
      'xl:col-start-1 xl:row-start-3 xl:col-span-3 xl:row-span-1',
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
      'xl:col-start-4 xl:row-start-3 xl:col-span-3 xl:row-span-1',
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
