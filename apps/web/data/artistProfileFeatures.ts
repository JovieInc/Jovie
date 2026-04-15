export type ArtistProfileFeaturePlacement = 'section' | 'card' | 'spec tile';

export interface ArtistProfileLaunchFeature {
  readonly feature: string;
  readonly benefit: string;
  readonly uiSurface: string;
  readonly copyCandidate: string;
  readonly placement: ArtistProfileFeaturePlacement;
}

export interface ArtistProfileFeatureTile {
  readonly id:
    | 'fast-by-design'
    | 'smart-routing'
    | 'deep-link-modes'
    | 'qr-ready'
    | 'dark-mode-first'
    | 'release-ready'
    | 'show-ready'
    | 'pay-ready'
    | 'fan-capture-built-in'
    | 'zero-setup'
    | 'polished-by-default'
    | 'dedicated-release-pages'
    | 'analytics';
  readonly title: string;
  readonly body: string;
  readonly accent:
    | 'blue'
    | 'purple'
    | 'pink'
    | 'orange'
    | 'green'
    | 'teal'
    | 'gray';
}

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
      uiSurface: 'Hero, outcomes cards, opinionated section',
      copyCandidate: 'Built to convert, not decorate.',
      placement: 'section',
    },
    {
      feature: 'Intelligent routing',
      benefit: 'Fans reach the right service faster.',
      uiSurface: 'Release Day mode and routing tile',
      copyCandidate: 'Send each fan where they are most likely to listen.',
      placement: 'spec tile',
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
      uiSurface: 'Phone surfaces, support mode, and QR tile',
      copyCandidate: 'Put one scan on the table, wall, or flyer.',
      placement: 'spec tile',
    },
    {
      feature: 'Zero setup',
      benefit: 'Artists do not need a builder workflow to get live.',
      uiSurface: 'How It Works strip',
      copyCandidate: 'Claim it, connect it, share it.',
      placement: 'section',
    },
  ] as const;

export const ARTIST_PROFILE_SPEC_TILES: readonly ArtistProfileFeatureTile[] = [
  {
    id: 'fast-by-design',
    title: 'Fast by design',
    body: 'Built to feel instant on the tap that matters.',
    accent: 'blue',
  },
  {
    id: 'smart-routing',
    title: 'Intelligent routing',
    body: 'Surfaces the right actions for the fan in front of it.',
    accent: 'purple',
  },
  {
    id: 'deep-link-modes',
    title: 'Deep-link modes',
    body: 'Send fans straight to /music, /shows, /pay, /subscribe, and more.',
    accent: 'pink',
  },
  {
    id: 'qr-ready',
    title: 'Trackable QR codes',
    body: 'Know which flyer, sticker, etc got you the most fans.',
    accent: 'orange',
  },
  {
    id: 'dark-mode-first',
    title: 'Dark mode first',
    body: 'Designed for low-light taps in clubs, venues, and late-night scrolls.',
    accent: 'gray',
  },
  {
    id: 'zero-setup',
    title: 'Zero setup',
    body: 'Claim it, connect once, go live.',
    accent: 'green',
  },
  {
    id: 'dedicated-release-pages',
    title: 'Dedicated release pages',
    body: 'Every drop gets its own smart-link page for presave, countdown, and release day.',
    accent: 'teal',
  },
] as const;
