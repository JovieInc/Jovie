import type { ProfileShowcaseStateId } from '@/features/profile/contracts';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

export type HomeProofAvailability = 'hidden' | 'visible';

/* ── Hero ─────────────────────────────────────────────── */

export interface HomeHeroContent {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly vanityUrl: string;
  readonly primaryCtaLabel: string;
  readonly heroStateId: ProfileShowcaseStateId;
}

/* ── Chapters ─────────────────────────────────────────── */

export interface HomeChapterCallout {
  readonly label: string;
  readonly body: string;
}

export interface HomeChapter1Content {
  readonly title: string;
  readonly body: string;
  readonly baseStateId: ProfileShowcaseStateId;
  readonly callouts: readonly [HomeChapterCallout, HomeChapterCallout];
  readonly alertStateIds: readonly ProfileShowcaseStateId[];
}

export interface HomeChapter2Content {
  readonly title: string;
  readonly body: string;
  readonly payStateId: ProfileShowcaseStateId;
  readonly thanksStateId: ProfileShowcaseStateId;
  readonly flowLine: string;
}

export interface HomeChapter3Item {
  readonly id: 'relationship' | 'countdown' | 'location';
  readonly title: string;
  readonly body: string;
}

export interface HomeChapter3Content {
  readonly title: string;
  readonly body: string;
  readonly items: readonly [
    HomeChapter3Item,
    HomeChapter3Item,
    HomeChapter3Item,
  ];
}

export interface HomeEngageCard {
  readonly id: 'smart-links' | 'countdown' | 'tour' | 'tips' | 'fans';
  readonly title: string;
  readonly body: string;
  readonly surfaceId: 'profile' | 'countdown' | 'tour' | 'tips' | 'fans';
}

export interface HomeEngageContent {
  readonly title: string;
  readonly body: string;
  readonly cards: readonly [
    HomeEngageCard,
    HomeEngageCard,
    HomeEngageCard,
    HomeEngageCard,
    HomeEngageCard,
  ];
}

export interface HomeRelationshipSectionCard {
  readonly title: string;
  readonly body: string;
}

export interface HomeRelationshipSectionContent {
  readonly title: string;
  readonly body: string;
  readonly cards: readonly [
    HomeRelationshipSectionCard,
    HomeRelationshipSectionCard,
  ];
  readonly footnote: string;
}

/* ── Philosophy ───────────────────────────────────────── */

export interface HomePhilosophyCard {
  readonly id: 'zero-setup' | 'speed' | 'fan-relationship';
  readonly title: string;
  readonly body: string;
}

export interface HomePhilosophyContent {
  readonly sectionTitle: string;
  readonly leadTitle: string;
  readonly leadBody: string;
  readonly leadStateId: ProfileShowcaseStateId;
  readonly cards: readonly [
    HomePhilosophyCard,
    HomePhilosophyCard,
    HomePhilosophyCard,
  ];
}

/* ── Final CTA ────────────────────────────────────────── */

export interface HomeFinalCtaContent {
  readonly title: string;
  readonly body: string;
  readonly primaryCtaLabel: string;
}

/* ── Shared ───────────────────────────────────────────── */

export const HOME_PAGE_ARTIST = {
  name: TIM_WHITE_PROFILE.name,
  handle: TIM_WHITE_PROFILE.handle,
  avatarSrc: TIM_WHITE_PROFILE.avatarSrc,
} as const;

/* ── Content ──────────────────────────────────────────── */

export const HOME_HERO_CONTENT: HomeHeroContent = {
  eyebrow: 'Built for artists',
  title: 'The link your music deserves.',
  body: 'Streams, drops, tips, bookings, and fan capture in a single page.',
  vanityUrl: 'jov.ie/you',
  primaryCtaLabel: 'Claim your profile',
  heroStateId: 'catalog',
};

export const HOME_CHAPTER_1_CONTENT: HomeChapter1Content = {
  title: 'Turn attention into action.',
  body: 'Every new song, video, or show reaches fans automatically. One opt-in, then Jovie keeps working.',
  baseStateId: 'fans-opt-in',
  callouts: [
    {
      label: 'New song',
      body: 'Fans get notified the moment a release goes live.',
    },
    {
      label: 'Local show',
      body: 'Nearby fans hear about shows in their city first.',
    },
  ],
  alertStateIds: ['fans-song-alert', 'fans-show-alert'],
};

export const HOME_CHAPTER_2_CONTENT: HomeChapter2Content = {
  title: 'Get paid.',
  body: 'Take tips, sell merch, and say thanks from the same link fans already know.',
  payStateId: 'tips-open',
  thanksStateId: 'tips-thank-you',
  flowLine: 'Fan tips once. You get paid. They become a reachable listener.',
};

export const HOME_CHAPTER_3_CONTENT: HomeChapter3Content = {
  title: 'Know who your fans are and when to reach them.',
  body: 'See who pays attention. Know who comes back. Keep the relationship.',
  items: [
    {
      id: 'relationship',
      title: 'Know Every Fan by Name.',
      body: 'See who tipped, who listened, who came to the show.',
    },
    {
      id: 'countdown',
      title: 'Countdowns Built In.',
      body: 'Scheduled releases become countdown pages automatically.',
    },
    {
      id: 'location',
      title: 'Location-Aware.',
      body: 'Fans in Chicago never scroll through LA tour dates.',
    },
  ],
};

export const HOME_ENGAGE_CONTENT: HomeEngageContent = {
  title: 'Engage.',
  body: 'The same profile handles listening, countdowns, tour dates, tips, and fan capture without another campaign to build.',
  cards: [
    {
      id: 'smart-links',
      title: 'Smart links that stay current.',
      body: 'One profile routes fans to the right release and the right streaming destination.',
      surfaceId: 'profile',
    },
    {
      id: 'countdown',
      title: 'Countdowns built in.',
      body: 'Upcoming drops turn into pre-save and countdown pages from the same link.',
      surfaceId: 'countdown',
    },
    {
      id: 'tour',
      title: 'Shows land in the right city.',
      body: 'Tour dates can lead the page when the next thing that matters is local.',
      surfaceId: 'tour',
    },
    {
      id: 'tips',
      title: 'Get paid without losing the moment.',
      body: 'Fans can tip in one tap and stay inside the same experience.',
      surfaceId: 'tips',
    },
    {
      id: 'fans',
      title: 'Recognize the people who care.',
      body: 'Tips, presaves, listens, and alerts turn into a fan relationship you can build on.',
      surfaceId: 'fans',
    },
  ],
};

export const HOME_RELATIONSHIP_SECTION_CONTENT: HomeRelationshipSectionContent =
  {
    title: 'Turn action into a relationship.',
    body: 'Get paid in the moment, then keep the fan warm with the same link they already trust.',
    cards: [
      {
        title: 'Take the payment.',
        body: 'Apple Pay and quick support flows make it easy to capture the moment while someone is ready.',
      },
      {
        title: 'Keep the signal.',
        body: 'Know who tipped, listened, or turned on notifications so the next follow-up starts warm.',
      },
    ],
    footnote:
      'A tip, a presave, or a show RSVP becomes a fan you recognize next time.',
  };

export const HOME_PHILOSOPHY_CONTENT: HomePhilosophyContent = {
  sectionTitle: 'Built for artists',
  leadTitle: 'Opinionated.',
  leadBody:
    'Conversion-first by default. No templates to break. No customization rabbit hole. Fans learn what to tap because every profile works the same way.',
  leadStateId: 'streams-release-day',
  cards: [
    {
      id: 'zero-setup',
      title: 'Zero Setup.',
      body: 'No setup required. Presaves, release day, and follow-up just happen.',
    },
    {
      id: 'speed',
      title: 'Stupid Fast.',
      body: 'Slow profiles don\u2019t convert. Jovie profiles are engineered to be lightning fast so you never lose a fan.',
    },
    {
      id: 'fan-relationship',
      title: 'Know Every Fan by Name.',
      body: 'See who pays attention. Know who comes back. Keep the relationship.',
    },
  ],
};

export const HOME_FINAL_CTA_CONTENT: HomeFinalCtaContent = {
  title: 'Claim your profile.',
  body: 'One link for every release.',
  primaryCtaLabel: 'Claim your profile',
};

export const HOMEPAGE_FINAL_CTA_CONTENT: HomeFinalCtaContent = {
  title: 'Stay in the studio.',
  body: 'Jovie automates the busy work, so you can stick to what you\u2019re good at: making great music.',
  primaryCtaLabel: 'Request Access',
};

/* ── Auto-Notify ─────────────────────────────────────── */

export interface HomeAutoNotifyContent {
  readonly title: string;
  readonly body: string;
  readonly notificationFrom: string;
  readonly notificationBody: string;
}

export const HOME_AUTO_NOTIFY_CONTENT: HomeAutoNotifyContent = {
  title: 'Notify every fan. Automatically.',
  body: 'Fans opt-in once. Every song hits their inbox automatically. No campaigns to setup. No copy to write. No emails to design. It just works.',
  notificationFrom: 'Jovie',
  notificationBody: 'Tim White just released Midnight Drive',
};
