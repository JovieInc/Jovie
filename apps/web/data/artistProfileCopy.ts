export interface ArtistProfileMode {
  readonly id: 'listen' | 'pay' | 'tour' | 'contact';
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
  readonly id: 'drive-streams' | 'sell-out' | 'get-paid' | 'share-anywhere';
  readonly title: string;
  readonly description: string;
}

export interface ArtistProfileOutcomeProof {
  readonly visualProofs: {
    readonly driveStreams: {
      readonly screenshotSrc: string;
      readonly screenshotAlt: string;
      readonly floatingCardLabel: string;
      readonly floatingCardTitle: string;
      readonly artistName: string;
      readonly floatingCardMeta: string;
      readonly primaryCtaLabel: string;
    };
    readonly sellOut: {
      readonly screenshotSrc: string;
      readonly screenshotAlt: string;
      readonly nearbyCardLabel: string;
      readonly nearbyDate: string;
      readonly nearbyVenue: string;
      readonly nearbyLocation: string;
      readonly nearbyCtaLabel: string;
      readonly drawerTitle: string;
      readonly drawerSubtitle: string;
      readonly drawerRows: readonly {
        readonly id: string;
        readonly month: string;
        readonly day: string;
        readonly venue: string;
        readonly location: string;
        readonly ctaLabel: string;
      }[];
    };
    readonly getPaid: {
      readonly screenshotSrc: string;
      readonly screenshotAlt: string;
      readonly drawerTitle: string;
      readonly drawerSubtitle: string;
      readonly chooseAmountLabel: string;
      readonly amountRows: readonly {
        readonly id: string;
        readonly amount: string;
        readonly currency: string;
        readonly featured?: boolean;
      }[];
      readonly ctaLabel: string;
    };
  };
  readonly shareAnywhere: {
    readonly url: string;
    readonly title: string;
    readonly subtitle: string;
  };
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
  readonly sentence: string;
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
    readonly contextCues: readonly [string, string, string, string];
    readonly modes: readonly ArtistProfileMode[];
  };
  readonly outcomes: {
    readonly eyebrow: string;
    readonly headline: string;
    readonly body: string;
    readonly cards: readonly ArtistProfileOutcomeCard[];
    readonly syntheticProofs: ArtistProfileOutcomeProof;
  };
  readonly monetization: {
    readonly headline: string;
    readonly subhead: string;
    readonly paidCard: {
      readonly title: string;
      readonly body: string;
      readonly contextLabel: string;
      readonly contextDetail: string;
    };
    readonly relationshipCard: {
      readonly title: string;
      readonly body: string;
      readonly timeline: readonly [
        {
          readonly id: 'payment';
          readonly label: string;
          readonly title: string;
          readonly detail: string;
          readonly meta: string;
        },
        {
          readonly id: 'follow-up-sent';
          readonly label: string;
          readonly title: string;
          readonly detail: string;
          readonly meta: string;
        },
        {
          readonly id: 'fan-reached';
          readonly label: string;
          readonly title: string;
          readonly detail: string;
          readonly meta: string;
        },
      ];
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
  readonly reactivation: {
    readonly eyebrow: string;
    readonly headline: string;
    readonly subhead: string;
    readonly workflow: {
      readonly columns: readonly [
        'Trigger',
        'Audience',
        'Message',
        'Destination',
      ];
      readonly rows: readonly {
        readonly id: 'release' | 'tour' | 'video' | 'support-follow-up';
        readonly trigger: string;
        readonly audience: string;
        readonly message: string;
        readonly destination: string;
      }[];
    };
    readonly outputs: readonly {
      readonly id: 'release-alerts' | 'nearby-show-alerts' | 'thank-you';
      readonly label: string;
      readonly title: string;
      readonly detail: string;
      readonly destination: string;
    }[];
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
    readonly subhead: string;
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
    eyebrow: '',
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
    contextCues: [
      'Source-aware',
      'Location-aware',
      'Device-aware',
      'Intent-aware',
    ],
    modes: [
      {
        id: 'listen',
        label: 'Listen',
        headline: 'Keep the latest music one tap away.',
        description: 'Keep the latest music one tap away.',
        pathLabel: 'jov.ie/you/listen',
        drawer: {
          title: 'Listen',
          subtitle: 'The latest release stays front and center.',
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
        screenshotSrc:
          '/product-screenshots/tim-white-profile-listen-phone.png',
        screenshotAlt: 'Jovie artist profile showing a listen-first view.',
        screenshotWidth: 660,
        screenshotHeight: 1368,
      },
      {
        id: 'tour',
        label: 'Tour',
        headline: 'Surface the right dates and ticket paths.',
        description: 'Surface the right dates and ticket paths.',
        pathLabel: 'jov.ie/you/tour',
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
        id: 'contact',
        label: 'Contact',
        headline: 'Make booking, management, and press easy to reach.',
        description: 'Make booking, management, and press easy to reach.',
        pathLabel: 'jov.ie/you/contact',
        drawer: {
          title: 'Contact',
          subtitle: 'Booking, management, and press in one place.',
          ctaLabel: 'Email team',
          items: [
            {
              id: 'booking',
              label: 'Booking',
              detail: 'North America + Europe',
              action: 'Email',
            },
            {
              id: 'management',
              label: 'Management',
              detail: 'Worldwide',
              action: 'Email',
            },
            {
              id: 'press',
              label: 'Press',
              detail: 'US + UK',
              action: 'Email',
            },
            {
              id: 'brands',
              label: 'Brands',
              detail: 'Partnerships',
              action: 'Email',
            },
          ],
        },
        screenshotSrc:
          '/product-screenshots/tim-white-profile-contact-phone.png',
        screenshotAlt:
          'Jovie artist profile showing contact access for booking and press.',
        screenshotWidth: 660,
        screenshotHeight: 1368,
      },
    ],
  },
  outcomes: {
    eyebrow: 'Fan outcomes',
    headline: 'Built for artists.',
    body: 'Four ways the same artist profile can move a fan from attention to action.',
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
        id: 'share-anywhere',
        title: 'Share anywhere',
        description:
          'Use one clean profile link across bio, QR, posts, stories, and shows.',
      },
    ],
    syntheticProofs: {
      visualProofs: {
        driveStreams: {
          screenshotSrc:
            '/product-screenshots/tim-white-profile-presave-phone.png',
          screenshotAlt:
            'Jovie profile showing the latest release and a pre-save state.',
          floatingCardLabel: 'Latest release',
          floatingCardTitle: 'The Deep End',
          artistName: 'Tim White',
          floatingCardMeta: 'Pre-save live',
          primaryCtaLabel: 'Turn on notifications',
        },
        sellOut: {
          screenshotSrc:
            '/product-screenshots/tim-white-profile-tour-phone.png',
          screenshotAlt:
            'Jovie profile showing an open tour drawer with upcoming ticket dates.',
          nearbyCardLabel: 'Nearby date',
          nearbyDate: 'May 18',
          nearbyVenue: 'The Novo',
          nearbyLocation: 'Los Angeles, CA, US',
          nearbyCtaLabel: 'Tickets',
          drawerTitle: 'Tour Dates',
          drawerSubtitle: 'Upcoming shows and ticket links.',
          drawerRows: [
            {
              id: 'los-angeles',
              month: 'May',
              day: '18',
              venue: 'The Novo',
              location: 'Los Angeles, CA, US',
              ctaLabel: 'Tickets',
            },
            {
              id: 'chicago',
              month: 'May',
              day: '24',
              venue: 'Radius',
              location: 'Chicago, IL, US',
              ctaLabel: 'Tickets',
            },
          ],
        },
        getPaid: {
          screenshotSrc: '/product-screenshots/tim-white-profile-pay-phone.png',
          screenshotAlt:
            'Jovie profile showing an open support drawer with payment amounts.',
          drawerTitle: 'Pay',
          drawerSubtitle: 'Send support instantly with Venmo.',
          chooseAmountLabel: 'Choose amount',
          amountRows: [
            {
              id: 'five',
              amount: '$5',
              currency: 'USD',
            },
            {
              id: 'ten',
              amount: '$10',
              currency: 'USD',
              featured: true,
            },
            {
              id: 'twenty',
              amount: '$20',
              currency: 'USD',
            },
          ],
          ctaLabel: 'Continue with Venmo',
        },
      },
      shareAnywhere: {
        url: 'jov.ie/tim',
        title: 'Share-ready',
        subtitle: 'Bio, QR, stories, and shows.',
      },
    },
  },
  monetization: {
    headline: 'Convert a one-time tip into a lifelong fan.',
    subhead:
      'Turn merch-table and QR support into a relationship you can reach again.',
    paidCard: {
      title: 'Get paid.',
      body: 'QR-ready support for shows, merch tables, and bios.',
      contextLabel: 'Merch Table QR',
      contextDetail: 'Scan to support',
    },
    relationshipCard: {
      title: 'Keep the fan.',
      body: 'Turn real-world support into a fan you can reach again.',
      timeline: [
        {
          id: 'payment',
          label: 'Activity',
          title: '$10 support received',
          detail: 'Merch Table QR · Venmo',
          meta: 'Email confirmed',
        },
        {
          id: 'follow-up-sent',
          label: 'Follow-up sent',
          title: "Thanks for the support tonight - here's the new song.",
          detail: 'Release alert delivered',
          meta: 'Open new single',
        },
        {
          id: 'fan-reached',
          label: 'Fan reached',
          title: 'New single opened',
          detail: 'Notifications on',
          meta: 'Ready for next show',
        },
      ],
    },
  },
  capture: {
    eyebrow: 'Owned audience',
    headline: 'Capture every fan.',
    subhead: 'Turn anonymous profile visits into fans you can reach again.',
    body: 'Collect permission once. Bring fans back for every release, show, drop, and update.',
    action: {
      title: 'Get updates',
      detail: 'Release and show alerts.',
      ctaLabel: 'Subscribe',
      confirmedLabel: 'Subscribed',
      beforeLabel: 'Before',
      beforeTitle: 'Anonymous fan action',
      beforeDetail: 'Clicked through to Spotify',
      afterLabel: 'After',
      afterTitle: 'Reachable fan',
      afterDetail: 'Email saved / Notifications on',
    },
    audienceRails: [
      [
        {
          id: 'spotify-jason-la',
          icon: 'spotify',
          sentence: 'Jason in LA clicked through to Spotify.',
        },
        {
          id: 'email-brian',
          icon: 'email',
          sentence: 'Brian M subscribed by email.',
        },
        {
          id: 'shows-london-o2',
          icon: 'shows',
          sentence: 'Ava in London saved O2 Arena.',
        },
        {
          id: 'qr-berlin-flyer',
          icon: 'qr',
          sentence: 'Mika in Berlin scanned the flyer.',
        },
      ],
      [
        {
          id: 'apple-tokyo',
          icon: 'apple',
          sentence: 'Kenji in Tokyo opened the release page.',
        },
        {
          id: 'youtube-sao-paulo',
          icon: 'youtube',
          sentence: 'Luana in Sao Paulo watched on YouTube.',
        },
        {
          id: 'subscribe-maya-notifications',
          icon: 'subscribe',
          sentence: 'Maya enabled notifications.',
        },
        {
          id: 'spotify-amelia-london',
          icon: 'spotify',
          sentence: 'Amelia in London checked out your Spotify.',
        },
      ],
      [
        {
          id: 'shows-chicago',
          icon: 'shows',
          sentence: 'Marcus in Chicago saved the show.',
        },
        {
          id: 'qr-miami-sticker',
          icon: 'qr',
          sentence: 'Sofia in Miami scanned the sticker.',
        },
        {
          id: 'email-nina',
          icon: 'email',
          sentence: 'Nina P confirmed the email opt-in.',
        },
        {
          id: 'pay-diego-support',
          icon: 'pay',
          sentence: 'Diego paid with Apple Pay.',
        },
      ],
    ],
  },
  reactivation: {
    eyebrow: 'Automatic reactivation',
    headline: 'Bring them back automatically.',
    subhead:
      'When the next moment matters, Jovie brings the right fans back to the right place.',
    workflow: {
      columns: ['Trigger', 'Audience', 'Message', 'Destination'],
      rows: [
        {
          id: 'release',
          trigger: 'New release',
          audience: 'Subscribers',
          message: 'Email sent',
          destination: '/music',
        },
        {
          id: 'tour',
          trigger: 'Tour announced',
          audience: 'Fans nearby',
          message: 'Alert sent',
          destination: '/shows',
        },
        {
          id: 'video',
          trigger: 'Video live',
          audience: 'Recent listeners',
          message: 'Notification sent',
          destination: '/music',
        },
        {
          id: 'support-follow-up',
          trigger: 'Support received',
          audience: 'Supporter',
          message: 'Thank-you sent',
          destination: '/music',
        },
      ],
    },
    outputs: [
      {
        id: 'release-alerts',
        label: 'Release alerts',
        title: 'Subscribers hear first.',
        detail: 'New release live now',
        destination: 'Email -> /music',
      },
      {
        id: 'nearby-show-alerts',
        label: 'Nearby show alerts',
        title: 'Fans in the right city get the date.',
        detail: 'Los Angeles added · The Novo',
        destination: 'Alert -> /shows',
      },
      {
        id: 'thank-you',
        label: 'Thank-you follow-ups',
        title: 'Support becomes the next listen.',
        detail: 'Thanks for the support tonight',
        destination: 'Message -> /music',
      },
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
    eyebrow: 'Power features',
    headline: 'Built for artists. Obsessively specific.',
    subhead: 'The details that make one profile work harder.',
  },
  howItWorks: {
    eyebrow: 'Zero setup',
    headline: 'Live in 60 seconds.',
    body: 'Claim. Sync. Share.',
    steps: [
      {
        id: 'claim',
        title: 'Claim',
        description: 'Search once and claim the profile.',
      },
      {
        id: 'connect',
        title: 'Sync',
        description:
          'It imports your catalog across 27+ providers and keeps the profile current.',
      },
      {
        id: 'share',
        title: 'Share',
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
    headline: 'Frequently Asked Questions',
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
    headline: "Don't lose the next fan.",
    subhead: 'Turn every visit into a stream, save, signup, or support.',
    ctaLabel: 'Claim your profile',
    signature: 'jov.ie/you',
  },
} as const;
