export interface ArtistProfileMode {
  readonly id: 'release' | 'shows' | 'pay' | 'subscribe' | 'links';
  readonly label: string;
  readonly headline: string;
  readonly description: string;
  readonly pathLabel: string;
  readonly screenshotSrc: string;
  readonly screenshotAlt: string;
  readonly screenshotWidth: number;
  readonly screenshotHeight: number;
}

export interface ArtistProfileOutcomeCard {
  readonly id:
    | 'drive-streams'
    | 'fill-the-room'
    | 'get-paid'
    | 'capture-fans'
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
    | 'music';
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
    };
    readonly audienceRails: readonly (readonly ArtistProfileAudiencePill[])[];
  };
  readonly opinionated: {
    readonly eyebrow: string;
    readonly headline: string;
    readonly headlineOptions: readonly string[];
    readonly body: string;
    readonly principles: readonly string[];
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
        screenshotSrc:
          '/product-screenshots/artist-profile-mode-release-phone.png',
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
        screenshotSrc:
          '/product-screenshots/artist-profile-mode-shows-phone.png',
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
        screenshotSrc: '/product-screenshots/artist-profile-mode-pay-phone.png',
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
        screenshotSrc:
          '/product-screenshots/artist-profile-mode-subscribe-phone.png',
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
        screenshotSrc:
          '/product-screenshots/artist-profile-mode-links-phone.png',
        screenshotAlt:
          'Jovie artist profile showing important fan destinations.',
        screenshotWidth: 660,
        screenshotHeight: 1368,
      },
    ],
  },
  outcomes: {
    eyebrow: 'Fan outcomes',
    headline: 'One profile. Infinite outcomes.',
    body: 'Five jobs one artist profile can do in seconds.',
    cards: [
      {
        id: 'drive-streams',
        title: 'Drive streams',
        description: 'Countdown, latest release, and release card behavior.',
      },
      {
        id: 'fill-the-room',
        title: 'Fill the room',
        description: 'Nearby shows and ticket paths move to the front.',
      },
      {
        id: 'get-paid',
        title: 'Get paid',
        description: 'Tip and support flows live inside the same profile.',
      },
      {
        id: 'capture-fans',
        title: 'Capture fans',
        description:
          'Subscribe and notification states turn traffic into reach.',
      },
      {
        id: 'share-anywhere',
        title: 'Share anywhere',
        description:
          'QR and short-link behavior for flyers, booths, and screens.',
      },
    ],
  },
  capture: {
    eyebrow: 'Owned audience',
    headline: 'Capture every fan.',
    subhead: 'Turn profile traffic into an identifiable, reachable audience.',
    body: 'Collect permission once. Bring fans back for every release, show, drop, and update.',
    action: {
      title: 'Get notified',
      detail: 'Release, show, and drop alerts from jov.ie/you',
      ctaLabel: 'Subscribe',
      confirmedLabel: 'Subscribed',
    },
    audienceRails: [
      [
        {
          id: 'spotify-jason-la',
          icon: 'spotify',
          identity: 'Jason',
          chips: ['LA', 'Spotify'],
          action: 'listened',
        },
        {
          id: 'subscribe-brian',
          icon: 'subscribe',
          identity: 'Brian M',
          chips: ['Subscribed'],
          action: 'joined',
        },
        {
          id: 'shows-london-o2',
          icon: 'shows',
          identity: 'London',
          chips: ['O2 Arena'],
          action: 'viewed tickets',
        },
        {
          id: 'qr-berlin-flyer',
          icon: 'qr',
          identity: 'Berlin',
          chips: ['QR'],
          action: 'scanned flyer',
        },
      ],
      [
        {
          id: 'apple-tokyo',
          icon: 'apple',
          identity: 'Tokyo',
          chips: ['Apple Music'],
          action: 'saved',
        },
        {
          id: 'youtube-sao-paulo',
          icon: 'youtube',
          identity: 'São Paulo',
          chips: ['YouTube'],
          action: 'watched latest',
        },
        {
          id: 'music-maya-release',
          icon: 'music',
          identity: 'Maya',
          chips: ['Release'],
          action: 'opened',
        },
        {
          id: 'spotify-amelia-london',
          icon: 'spotify',
          identity: 'Amelia',
          chips: ['London', 'Spotify'],
          action: 'followed',
        },
      ],
      [
        {
          id: 'shows-chicago',
          icon: 'shows',
          identity: 'Chicago',
          chips: ['Shows'],
          action: 'saved date',
        },
        {
          id: 'qr-miami-sticker',
          icon: 'qr',
          identity: 'Miami',
          chips: ['Sticker'],
          action: 'scanned',
        },
        {
          id: 'subscribe-nina',
          icon: 'subscribe',
          identity: 'Nina P',
          chips: ['Email'],
          action: 'opted in',
        },
        {
          id: 'apple-seattle-pay',
          icon: 'apple',
          identity: 'Seattle',
          chips: ['Pay'],
          action: 'supported',
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
