export interface ArtistProfileMode {
  readonly id: 'release' | 'shows' | 'pay' | 'subscribe' | 'links';
  readonly label: string;
  readonly headline: string;
  readonly description: string;
  readonly pathLabel: string;
  readonly drawer: ArtistProfileModeDrawer;
  readonly screenshotSrc: string;
  readonly screenshotAlt: string;
  readonly screenshotWidth: number;
  readonly screenshotHeight: number;
}

export interface ArtistProfileModeDrawer {
  readonly title: string;
  readonly subtitle: string;
  readonly ctaLabel: string;
  readonly items: readonly ArtistProfileModeDrawerItem[];
}

export interface ArtistProfileModeDrawerItem {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly action: string;
}

export interface ArtistProfileOutcomeCard {
  readonly id:
    | 'drive-streams'
    | 'sell-out'
    | 'get-paid'
    | 'say-thanks'
    | 'share-anywhere';
  readonly title: string;
  readonly description: string;
}

export interface ArtistProfileHowItWorksStep {
  readonly id: 'claim' | 'connect' | 'share';
  readonly title: string;
  readonly description: string;
}

export interface ArtistProfileFaqItem {
  readonly question: string;
  readonly answer: string;
}

export interface ArtistProfileAudiencePill {
  readonly id: string;
  readonly icon:
    | 'spotify'
    | 'apple'
    | 'youtube'
    | 'qr'
    | 'shows'
    | 'subscribe'
    | 'music'
    | 'email'
    | 'pay';
  readonly identity: string;
  readonly chips: readonly string[];
  readonly action: string;
}

export interface ArtistProfileLandingCopy {
  readonly seo: {
    readonly title: string;
    readonly description: string;
    readonly keywords: readonly string[];
  };
  readonly hero: {
    readonly eyebrow: string;
    readonly headline: string;
    readonly subhead: string;
    readonly ctaLabel: string;
    readonly signature: string;
    readonly proofWhisper: string;
    readonly phoneCaption: string;
    readonly phoneSubcaption: string;
  };
  readonly adaptive: {
    readonly eyebrow: string;
    readonly headline: string;
    readonly alternateHeadlines: readonly string[];
    readonly body: string;
    readonly modes: readonly ArtistProfileMode[];
  };
  readonly outcomes: {
    readonly eyebrow: string;
    readonly headline: string;
    readonly body: string;
    readonly cards: readonly ArtistProfileOutcomeCard[];
  };
  readonly monetization: {
    readonly headline: string;
    readonly subhead: string;
    readonly paidCard: {
      readonly title: string;
      readonly body: string;
    };
    readonly followUpCard: {
      readonly title: string;
      readonly body: string;
      readonly message: string;
    };
  };
  readonly capture: {
    readonly eyebrow: string;
    readonly headline: string;
    readonly subhead: string;
    readonly body: string;
    readonly action: {
      readonly title: string;
      readonly detail: string;
      readonly ctaLabel: string;
      readonly confirmedLabel: string;
      readonly beforeLabel: string;
      readonly beforeTitle: string;
      readonly beforeDetail: string;
      readonly afterLabel: string;
      readonly afterTitle: string;
      readonly afterDetail: string;
    };
    readonly audienceRails: readonly (readonly ArtistProfileAudiencePill[])[];
  };
  readonly opinionated: {
    readonly eyebrow: string;
    readonly headline: string;
    readonly headlineOptions: readonly string[];
    readonly body: string;
    readonly principles: readonly string[];
    readonly rules: readonly ArtistProfileOpinionatedRule[];
  };
  readonly specWall: {
    readonly eyebrow: string;
    readonly headline: string;
    readonly lead?: string;
  };
  readonly howItWorks: {
    readonly eyebrow: string;
    readonly headline: string;
    readonly body: string;
    readonly steps: readonly ArtistProfileHowItWorksStep[];
  };
  readonly socialProof: {
    readonly eyebrow: string;
    readonly headline: string;
    readonly intro: string;
  };
  readonly faq: {
    readonly headline: string;
    readonly items: readonly ArtistProfileFaqItem[];
  };
  readonly finalCta: {
    readonly headline: string;
    readonly subhead: string;
    readonly ctaLabel: string;
    readonly signature: string;
  };
}

export interface ArtistProfileOpinionatedRule {
  readonly id: 'release' | 'shows' | 'support';
  readonly context: string;
  readonly result: string;
}

export const ARTIST_PROFILE_COPY: ArtistProfileLandingCopy = {
  seo: {
    title: 'Artist Profiles',
    description:
      'Claim your free artist profile on Jovie. One link that adapts to every release, show, and fan moment.',
    keywords: [
      'artist profile',
      'link in bio for musicians',
      'music smart links',
      'artist landing page',
      'linktree alternative for artists',
      'music link in bio',
      'artist bio page',
    ],
  },
  hero: {
    eyebrow: 'Built for artists',
    headline: 'The link your music deserves.',
    subhead:
      'Streams, drops, support, bookings, and fan capture in a single page.',
    ctaLabel: 'Claim your profile',
    signature: 'jov.ie/you',
    proofWhisper: 'Used by artists on',
    phoneCaption: 'One profile.',
    phoneSubcaption: 'Adapts to every fan.',
  },
  adaptive: {
    eyebrow: 'Adaptive profile',
    headline: 'Built for every mode.',
    alternateHeadlines: [
      'One profile for every release moment.',
      'One link, tuned to what matters right now.',
      'The same link, different job.',
    ],
    body: 'One profile can flex from release push to ticket sales to fan capture.',
    modes: [
      {
        id: 'release',
        label: 'Release',
        headline: 'Put the newest music or campaign first.',
        description: 'Put the newest music or campaign first.',
        pathLabel: 'jov.ie/you/music',
        drawer: {
          title: 'Release',
          subtitle: 'Take Me Over is live now.',
          ctaLabel: 'Open release page',
          items: [
            {
              id: 'spotify',
              label: 'Spotify',
              detail: 'Best for Jason in LA',
              action: 'Play',
            },
            {
              id: 'apple-music',
              label: 'Apple Music',
              detail: 'Saved by returning fans',
              action: 'Open',
            },
            {
              id: 'youtube',
              label: 'YouTube',
              detail: 'Watch the latest video',
              action: 'Watch',
            },
          ],
        },
        screenshotSrc: '/product-screenshots/tim-white-profile-live-phone.png',
        screenshotAlt: 'Jovie artist profile showing a release-first view.',
        screenshotWidth: 660,
        screenshotHeight: 1368,
      },
      {
        id: 'shows',
        label: 'Shows',
        headline: 'Surface the right dates and ticket paths.',
        description: 'Surface the right dates and ticket paths.',
        pathLabel: 'jov.ie/you/shows',
        drawer: {
          title: 'Tour dates',
          subtitle: 'Nearby dates rise to the top.',
          ctaLabel: 'View all dates',
          items: [
            {
              id: 'la',
              label: 'Los Angeles',
              detail: 'May 18 - The Novo',
              action: 'Tickets',
            },
            {
              id: 'chicago',
              label: 'Chicago',
              detail: 'May 24 - Radius',
              action: 'Tickets',
            },
            {
              id: 'new-york',
              label: 'New York',
              detail: 'Jun 02 - Brooklyn Mirage',
              action: 'Tickets',
            },
            {
              id: 'london',
              label: 'London',
              detail: 'Jun 14 - O2 Academy',
              action: 'Tickets',
            },
            {
              id: 'berlin',
              label: 'Berlin',
              detail: 'Jun 21 - Astra Kulturhaus',
              action: 'Tickets',
            },
          ],
        },
        screenshotSrc: '/product-screenshots/tim-white-profile-tour-phone.png',
        screenshotAlt:
          'Jovie artist profile showing nearby shows and ticket paths.',
        screenshotWidth: 660,
        screenshotHeight: 1368,
      },
      {
        id: 'pay',
        label: 'Pay',
        headline: 'Make support one tap away.',
        description: 'Make support one tap away.',
        pathLabel: 'jov.ie/you/pay',
        drawer: {
          title: 'Support',
          subtitle: 'Choose an amount.',
          ctaLabel: 'Continue with Venmo',
          items: [
            {
              id: 'five',
              label: '$5',
              detail: 'Quick support',
              action: 'USD',
            },
            {
              id: 'ten',
              label: '$10',
              detail: 'Most common',
              action: 'USD',
            },
            {
              id: 'twenty',
              label: '$20',
              detail: 'Top fan',
              action: 'USD',
            },
          ],
        },
        screenshotSrc: '/product-screenshots/tim-white-profile-pay-phone.png',
        screenshotAlt: 'Jovie artist profile showing direct support options.',
        screenshotWidth: 660,
        screenshotHeight: 1368,
      },
      {
        id: 'subscribe',
        label: 'Subscribe',
        headline: 'Turn a visit into a direct line.',
        description: 'Turn a visit into a direct line.',
        pathLabel: 'jov.ie/you/subscribe',
        drawer: {
          title: 'Subscribe',
          subtitle: 'Get release, show, and drop alerts.',
          ctaLabel: 'Notifications on',
          items: [
            {
              id: 'email',
              label: 'Email',
              detail: 'fan@example.com',
              action: 'Verified',
            },
            {
              id: 'notifications',
              label: 'Notifications',
              detail: 'Release and show alerts',
              action: 'On',
            },
            {
              id: 'source',
              label: 'Source',
              detail: 'Spotify - LA',
              action: 'Saved',
            },
          ],
        },
        screenshotSrc:
          '/product-screenshots/tim-white-profile-subscribe-phone.png',
        screenshotAlt: 'Jovie artist profile showing fan subscription capture.',
        screenshotWidth: 660,
        screenshotHeight: 1368,
      },
      {
        id: 'links',
        label: 'Links',
        headline: 'Keep every important destination reachable.',
        description: 'Keep every important destination reachable.',
        pathLabel: 'jov.ie/you/links',
        drawer: {
          title: 'Links',
          subtitle: 'Every important destination stays reachable.',
          ctaLabel: 'Open profile',
          items: [
            {
              id: 'spotify',
              label: 'Spotify',
              detail: 'Music',
              action: 'Open',
            },
            {
              id: 'youtube',
              label: 'YouTube',
              detail: 'Video',
              action: 'Watch',
            },
            {
              id: 'instagram',
              label: 'Instagram',
              detail: 'Social',
              action: 'Follow',
            },
            {
              id: 'booking',
              label: 'Booking',
              detail: 'Contact',
              action: 'Send',
            },
          ],
        },
        screenshotSrc:
          '/product-screenshots/tim-white-profile-listen-phone.png',
        screenshotAlt:
          'Jovie artist profile showing important fan destinations.',
        screenshotWidth: 660,
        screenshotHeight: 1368,
      },
    ],
  },
  outcomes: {
    eyebrow: 'Fan outcomes',
    headline: 'Built for artists.',
    body: 'Five ways the same artist profile can move a fan from attention to action.',
    cards: [
      {
        id: 'drive-streams',
        title: 'Drive streams',
        description:
          'Put the latest release, pre-save, or countdown at the front of the profile.',
      },
      {
        id: 'sell-out',
        title: 'Sell out',
        description:
          'Surface the right show moment with saved dates, nearby venues, and ticket intent.',
      },
      {
        id: 'get-paid',
        title: 'Get paid',
        description: 'Make direct support feel native to the artist profile.',
      },
      {
        id: 'say-thanks',
        title: 'Say thanks',
        description:
          'Turn a support moment into a personal follow-up fans remember.',
      },
      {
        id: 'share-anywhere',
        title: 'Share anywhere',
        description:
          'Use one clean profile link across bio, QR, posts, stories, and shows.',
      },
    ],
  },
  monetization: {
    headline: 'Get paid. Stay close.',
    subhead: 'Support should not end at the transaction.',
    paidCard: {
      title: 'Get paid.',
      body: 'Tips and direct support live inside the same profile.',
    },
    followUpCard: {
      title: 'Say thanks.',
      body: 'Turn a one-time payment into a repeat listen, follow, or save.',
      message: 'Thanks for the support - new song inside.',
    },
  },
  capture: {
    eyebrow: 'Owned audience',
    headline: 'Capture every fan.',
    subhead: 'Turn anonymous profile visits into fans you can reach again.',
    body: 'Collect permission once. Bring fans back for every release, show, drop, and update.',
    action: {
      title: 'Subscribe',
      detail: 'Get release and show alerts from Tim White.',
      ctaLabel: 'Subscribe',
      confirmedLabel: 'Captured',
      beforeLabel: 'Before',
      beforeTitle: 'Anonymous visit',
      beforeDetail: 'Spotify / LA / Release page',
      afterLabel: 'After',
      afterTitle: 'Reachable fan',
      afterDetail: 'Email verified / Notifications on / Source saved',
    },
    audienceRails: [
      [
        {
          id: 'spotify-jason-la',
          icon: 'spotify',
          identity: 'Jason',
          chips: ['LA', 'Spotify'],
          action: 'Listened',
        },
        {
          id: 'email-brian',
          icon: 'email',
          identity: 'Brian M',
          chips: ['Email'],
          action: 'Subscribed',
        },
        {
          id: 'shows-london-o2',
          icon: 'shows',
          identity: 'Ava',
          chips: ['London', 'O2 Arena'],
          action: 'Saved',
        },
        {
          id: 'qr-berlin-flyer',
          icon: 'qr',
          identity: 'Mika',
          chips: ['Berlin', 'Flyer'],
          action: 'Scanned',
        },
      ],
      [
        {
          id: 'apple-tokyo',
          icon: 'apple',
          identity: 'Kenji',
          chips: ['Tokyo', 'Latest Release'],
          action: 'Opened',
        },
        {
          id: 'youtube-sao-paulo',
          icon: 'youtube',
          identity: 'Luana',
          chips: ['São Paulo', 'YouTube'],
          action: 'Watched',
        },
        {
          id: 'subscribe-maya-notifications',
          icon: 'subscribe',
          identity: 'Maya',
          chips: ['Notifications'],
          action: 'Enabled',
        },
        {
          id: 'spotify-amelia-london',
          icon: 'spotify',
          identity: 'Amelia',
          chips: ['London', 'Spotify'],
          action: 'Saved',
        },
      ],
      [
        {
          id: 'shows-chicago',
          icon: 'shows',
          identity: 'Marcus',
          chips: ['Chicago', 'Shows'],
          action: 'Saved',
        },
        {
          id: 'qr-miami-sticker',
          icon: 'qr',
          identity: 'Sofia',
          chips: ['Miami', 'Sticker'],
          action: 'Scanned',
        },
        {
          id: 'email-nina',
          icon: 'email',
          identity: 'Nina P',
          chips: ['Email Opt-In'],
          action: 'Confirmed',
        },
        {
          id: 'pay-diego-support',
          icon: 'pay',
          identity: 'Diego',
          chips: ['Support', 'Apple Pay'],
          action: 'Paid',
        },
      ],
    ],
  },
  opinionated: {
    eyebrow: 'Product philosophy',
    headline: 'Opinionated. By design.',
    headlineOptions: [
      'Opinionated. By design.',
      'Built to convert, not decorate.',
      'No template maze.',
    ],
    body: 'Jovie is intentionally constrained. No theme builder. No layout rabbit hole. No generic creator-site sprawl. Every profile teaches fans what to tap because the product is built around release moments, show moments, and conversion.',
    principles: ['No theme builder', 'No template maze', 'Built to convert'],
    rules: [
      {
        id: 'release',
        context: 'Release moment',
        result: 'Music first',
      },
      {
        id: 'shows',
        context: 'Nearby show',
        result: 'Tickets first',
      },
      {
        id: 'support',
        context: 'Support intent',
        result: 'Pay first',
      },
    ],
  },
  specWall: {
    eyebrow: 'Specs',
    headline: 'Built for artists.',
  },
  howItWorks: {
    eyebrow: 'Zero setup',
    headline: 'Live in 60 seconds.',
    body: 'Claim your artist. Jovie builds the page. Share one link everywhere.',
    steps: [
      {
        id: 'claim',
        title: 'Claim your artist.',
        description: 'Search once and claim the profile.',
      },
      {
        id: 'connect',
        title: 'Jovie builds the page.',
        description:
          'It imports your catalog across 27+ providers and keeps the profile current.',
      },
      {
        id: 'share',
        title: 'Share one link everywhere.',
        description: 'Use it in bio, stories, QR, release posts, and shows.',
      },
    ],
  },
  socialProof: {
    eyebrow: 'Proof',
    headline: 'Real Artists. Real workflows.',
    intro: 'Real artist profiles. Real release moments.',
  },
  faq: {
    headline: 'Frequently asked questions',
    items: [
      {
        question: 'How is Jovie different from Linktree?',
        answer:
          'Linktree is a general-purpose link list. Jovie is a music profile that understands releases, shows, pay, fan capture, and the actions artists need fans to take.',
      },
      {
        question: 'How is it different from a smart link or pre-save page?',
        answer:
          'A smart link or pre-save page usually serves one campaign. Jovie gives the artist one profile that can route to music, shows, pay, subscribe, releases, and future fan actions.',
      },
      {
        question: 'Can I deep-link to specific modes like shows or pay?',
        answer:
          'Yes. You can send fans straight to modes like music, shows, pay, subscribe, and more without asking them to hunt through the full profile.',
      },
      {
        question: 'Do I need to design or customize anything?',
        answer:
          'No. Jovie is polished by default. You claim it, connect once, and the page is built around your identity and content without theme work.',
      },
      {
        question: 'What can fans do from one profile?',
        answer:
          'Fans can listen, find shows, buy tickets, pay or support, subscribe, scan QR codes, and opt in so you can reach them again.',
      },
      {
        question: 'How long does setup take?',
        answer:
          'Jovie imports your whole catalog, matches it across 27+ providers, and builds a live always up-to-date profile in 60 seconds.',
      },
    ],
  },
  finalCta: {
    headline: 'Claim your profile.',
    subhead: 'Your next release deserves a better link.',
    ctaLabel: 'Claim your profile',
    signature: 'jov.ie/you',
  },
} as const;
