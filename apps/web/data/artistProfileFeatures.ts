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
    | 'audience-quality-filtering'
    | 'own-your-fan-list'
    | 'activate-creators'
    | 'geo-insights'
    | 'always-in-sync'
    | 'retarget-warm-fans'
    | 'press-ready-assets'
    | 'utm-builder';
  readonly title: string;
  readonly body: string;
  readonly size: 'large' | 'small';
  readonly accent: 'blue' | 'teal' | 'green' | 'orange' | 'rose' | 'gray';
  readonly kicker: string;
  readonly proofMeta: readonly string[];
  readonly proofVariant:
    | 'audience-quality'
    | 'fan-list'
    | 'creator-activation'
    | 'geo-insights'
    | 'always-in-sync'
    | 'retarget-warm-fans'
    | 'press-ready-assets'
    | 'utm-builder';
  readonly screenshotSrc?: string;
  readonly screenshotAlt?: string;
  readonly screenshotWidth?: number;
  readonly screenshotHeight?: number;
  readonly objectPosition?: string;
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
    id: 'audience-quality-filtering',
    title: 'Audience quality filtering',
    body: 'Filters junk traffic, self-visits, and low-signal clicks so your audience view stays real.',
    size: 'large',
    accent: 'blue',
    kicker: 'Signal clarity',
    proofMeta: ['Quality view', 'Low-signal removed', 'Self-visits hidden'],
    proofVariant: 'audience-quality',
    screenshotSrc:
      '/product-screenshots/artist-spec-audience-quality-desktop.png',
    screenshotAlt: 'Jovie audience CRM view showing clean audience rows.',
    screenshotWidth: 970,
    screenshotHeight: 612,
    objectPosition: '50% 0%',
  },
  {
    id: 'own-your-fan-list',
    title: 'Own your fan list',
    body: 'Fan CRM with exportable data, so the audience you build stays yours.',
    size: 'large',
    accent: 'teal',
    kicker: 'Audience ownership',
    proofMeta: ['Segments', 'Notes', 'Export-ready'],
    proofVariant: 'fan-list',
    screenshotSrc: '/product-screenshots/artist-spec-fan-list-desktop.png',
    screenshotAlt: 'Jovie audience CRM showing saved fan data and segments.',
    screenshotWidth: 970,
    screenshotHeight: 612,
    objectPosition: '50% 0%',
  },
  {
    id: 'activate-creators',
    title: 'Activate creators',
    body: 'Give fans and influencers a direct path to use the sound and spread the release.',
    accent: 'green',
    size: 'large',
    kicker: 'Creator velocity',
    proofMeta: ['Use this sound', 'Add to story', 'Creator share path'],
    proofVariant: 'creator-activation',
    screenshotSrc: '/product-screenshots/artist-spec-creator-menu-mobile.png',
    screenshotAlt: 'Jovie release landing page showing creator-share surfaces.',
    screenshotWidth: 390,
    screenshotHeight: 412,
    objectPosition: '50% 0%',
  },
  {
    id: 'geo-insights',
    title: 'Geo insights',
    body: 'See where attention is building before you book, announce, or spend.',
    size: 'large',
    accent: 'orange',
    kicker: 'Tour planning',
    proofMeta: ['Los Angeles +24%', 'Mexico City +18%', 'London +11%'],
    proofVariant: 'geo-insights',
    screenshotSrc: '/product-screenshots/artist-spec-geo-insights-desktop.png',
    screenshotAlt:
      'Jovie audience analytics showing top cities and geo insights.',
    screenshotWidth: 344,
    screenshotHeight: 540,
    objectPosition: '50% 0%',
  },
  {
    id: 'always-in-sync',
    title: 'Always in sync',
    body: 'New music, top tracks, and profile surfaces update automatically.',
    size: 'small',
    accent: 'rose',
    kicker: 'Live updates',
    proofMeta: ['New music', 'Top tracks', 'Profile refresh'],
    proofVariant: 'always-in-sync',
    screenshotSrc: '/product-screenshots/artist-spec-sync-settings-desktop.png',
    screenshotAlt:
      'Jovie settings showing connected platforms and auto-sync preferences.',
    screenshotWidth: 970,
    screenshotHeight: 518,
    objectPosition: '50% 0%',
  },
  {
    id: 'retarget-warm-fans',
    title: 'Retarget warm fans',
    body: 'Reconnect with visitors who showed intent and bring them back to the next release.',
    size: 'small',
    accent: 'blue',
    kicker: 'Return paths',
    proofMeta: ['Warm audience', 'Next release', 'Brought back'],
    proofVariant: 'retarget-warm-fans',
    screenshotSrc: '/product-screenshots/artist-spec-retargeting-desktop.png',
    screenshotAlt:
      'Jovie audience view showing returning visitors and warm-fan signals.',
    screenshotWidth: 970,
    screenshotHeight: 612,
    objectPosition: '50% 0%',
  },
  {
    id: 'press-ready-assets',
    title: 'Press-ready assets',
    body: 'Photos and key assets ready for promoters, media, and partners.',
    size: 'small',
    accent: 'gray',
    kicker: 'Partner handoff',
    proofMeta: ['Portrait', 'Square', 'Press'],
    proofVariant: 'press-ready-assets',
    screenshotSrc: '/product-screenshots/artist-spec-press-assets-mobile.png',
    screenshotAlt:
      'Jovie artist profile showing artist media and profile assets.',
    screenshotWidth: 390,
    screenshotHeight: 347,
    objectPosition: '50% 0%',
  },
  {
    id: 'utm-builder',
    title: 'Track every campaign',
    body: 'Build tagged links fast so every post, ad, and partner placement stays measurable.',
    size: 'small',
    accent: 'teal',
    kicker: 'UTM Builder',
    proofMeta: ['Source tags', 'Campaign links', 'Saved presets'],
    proofVariant: 'utm-builder',
    screenshotSrc: '/product-screenshots/artist-spec-tracked-links-desktop.png',
    screenshotAlt:
      'Jovie release actions showing tracked links and campaign presets.',
    screenshotWidth: 920,
    screenshotHeight: 442,
    objectPosition: '50% 0%',
  },
] as const;
