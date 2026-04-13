import type { ProfileShowcaseStateId } from '@/features/profile/contracts';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

export type HomeProofAvailability = 'hidden' | 'visible';
export type HomeStoryStage = 'hero' | 'story';

export type HomePrimaryChapterId = 'streams' | 'fans' | 'tips';

export type HomePrimarySubsceneId =
  | 'streams-latest'
  | 'streams-presave'
  | 'streams-release-day'
  | 'streams-video'
  | 'fans-opt-in'
  | 'fans-confirmed'
  | 'fans-song-alert'
  | 'fans-show-alert'
  | 'tips-open'
  | 'tips-apple-pay'
  | 'tips-thank-you'
  | 'tips-followup';

export interface HomePrimarySubscene {
  readonly id: HomePrimarySubsceneId;
  readonly chapterId: HomePrimaryChapterId;
  readonly headline: string;
  readonly supportLine: string;
  readonly body: string;
  readonly showcaseState: ProfileShowcaseStateId;
}

export interface HomePrimaryChapter {
  readonly id: HomePrimaryChapterId;
  readonly headline: string;
  readonly supportLine: string;
  readonly subscenes: readonly HomePrimarySubscene[];
}

interface HomeHeroContent {
  readonly title: string;
  readonly body: string;
  readonly vanityUrl: string;
  readonly primaryCtaLabel: string;
  readonly secondaryCtaLabel: string;
}

export interface HomeComparisonSide {
  readonly id: 'campaign-rhythm' | 'always-on-system';
  readonly title: string;
  readonly body: string;
  readonly points: readonly string[];
}

export interface HomeSecondaryModule {
  readonly id: 'shows' | 'booking' | 'catalog';
  readonly title: string;
  readonly body: string;
  readonly showcaseState: ProfileShowcaseStateId;
}

export interface HomeSpecFact {
  readonly id:
    | 'one-link'
    | 'auto-switching'
    | 'video-ready'
    | 'email-notifications'
    | 'tour-mode'
    | 'tips-and-contacts'
    | 'audience-crm';
  readonly value: string;
}

export interface HomeSpecCard {
  readonly id:
    | 'opinionated-design'
    | 'automatic-default'
    | 'own-the-relationship'
    | 'audience-depth';
  readonly title: string;
  readonly body: string;
  readonly points?: readonly string[];
}

export const HOME_HERO_CONTENT: HomeHeroContent = {
  title: 'The link your music deserves.',
  body: 'Drive more streams automatically, notify every fan every time, and get paid from one profile that updates itself.',
  vanityUrl: 'jov.ie/you',
  primaryCtaLabel: 'Claim your profile',
  secondaryCtaLabel: 'See it live',
};

export const HOME_STORY_ARTIST = {
  name: TIM_WHITE_PROFILE.name,
  handle: TIM_WHITE_PROFILE.handle,
  avatarSrc: TIM_WHITE_PROFILE.avatarSrc,
} as const;

export const HOME_PRIMARY_CHAPTERS: readonly HomePrimaryChapter[] = [
  {
    id: 'streams',
    headline: 'Drive more streams automatically.',
    supportLine: 'No templates. No campaign setup. No manual flips.',
    subscenes: [
      {
        id: 'streams-latest',
        chapterId: 'streams',
        headline: 'Drive more streams automatically.',
        supportLine: 'No templates. No campaign setup. No manual flips.',
        body: 'Your latest release stays one tap away.',
        showcaseState: 'streams-latest',
      },
      {
        id: 'streams-presave',
        chapterId: 'streams',
        headline: 'Drive more streams automatically.',
        supportLine: 'No templates. No campaign setup. No manual flips.',
        body: 'When the next release is scheduled, Jovie flips the profile to presave automatically.',
        showcaseState: 'streams-presave',
      },
      {
        id: 'streams-release-day',
        chapterId: 'streams',
        headline: 'Drive more streams automatically.',
        supportLine: 'No templates. No campaign setup. No manual flips.',
        body: 'On release day, it becomes your new featured release automatically.',
        showcaseState: 'streams-release-day',
      },
      {
        id: 'streams-video',
        chapterId: 'streams',
        headline: 'Drive more streams automatically.',
        supportLine: 'No templates. No campaign setup. No manual flips.',
        body: 'When the video lands, the profile can lead with that too.',
        showcaseState: 'streams-video',
      },
    ],
  },
  {
    id: 'fans',
    headline: 'Notify every fan every time.',
    supportLine:
      'Fans opt in once. Songs, videos, and shows keep reaching them.',
    subscenes: [
      {
        id: 'fans-opt-in',
        chapterId: 'fans',
        headline: 'Notify every fan every time.',
        supportLine:
          'Fans opt in once. Songs, videos, and shows keep reaching them.',
        body: 'Fans tap once to stay in the loop.',
        showcaseState: 'fans-opt-in',
      },
      {
        id: 'fans-confirmed',
        chapterId: 'fans',
        headline: 'Notify every fan every time.',
        supportLine:
          'Fans opt in once. Songs, videos, and shows keep reaching them.',
        body: 'Fans opt in once, then the system keeps working after that.',
        showcaseState: 'fans-confirmed',
      },
      {
        id: 'fans-song-alert',
        chapterId: 'fans',
        headline: 'Notify every fan every time.',
        supportLine:
          'Fans opt in once. Songs, videos, and shows keep reaching them.',
        body: 'New songs land in their inbox automatically.',
        showcaseState: 'fans-song-alert',
      },
      {
        id: 'fans-show-alert',
        chapterId: 'fans',
        headline: 'Notify every fan every time.',
        supportLine:
          'Fans opt in once. Songs, videos, and shows keep reaching them.',
        body: 'Videos and local shows can reach the same fans too.',
        showcaseState: 'fans-show-alert',
      },
    ],
  },
  {
    id: 'tips',
    headline: 'Get paid.',
    supportLine: 'Get paid, say thanks, and turn support into a listener.',
    subscenes: [
      {
        id: 'tips-open',
        chapterId: 'tips',
        headline: 'Get paid.',
        supportLine: 'Get paid, say thanks, and turn support into a listener.',
        body: 'Take the payment in one tap.',
        showcaseState: 'tips-open',
      },
      {
        id: 'tips-apple-pay',
        chapterId: 'tips',
        headline: 'Get paid.',
        supportLine: 'Get paid, say thanks, and turn support into a listener.',
        body: 'The payment moment stays frictionless with Apple Pay.',
        showcaseState: 'tips-apple-pay',
      },
      {
        id: 'tips-thank-you',
        chapterId: 'tips',
        headline: 'Get paid.',
        supportLine: 'Get paid, say thanks, and turn support into a listener.',
        body: 'Say thanks with the latest song.',
        showcaseState: 'tips-thank-you',
      },
      {
        id: 'tips-followup',
        chapterId: 'tips',
        headline: 'Get paid.',
        supportLine: 'Get paid, say thanks, and turn support into a listener.',
        body: 'The tip can turn into a listener you can reach again.',
        showcaseState: 'tips-followup',
      },
    ],
  },
] as const;

export const HOME_STORY_SCENES: readonly HomePrimarySubscene[] =
  HOME_PRIMARY_CHAPTERS.flatMap(chapter => chapter.subscenes);

export const HOME_COMPARISON_SIDES: readonly HomeComparisonSide[] = [
  {
    id: 'campaign-rhythm',
    title: 'Spike',
    body: 'Attention spikes, then disappears back to zero.',
    points: [
      'Launch-day spikes',
      'Manual page flips',
      'Fans disappear after the click',
    ],
  },
  {
    id: 'always-on-system',
    title: 'Momentum',
    body: 'More songs, more video, more shows, more reasons for fans to come back.',
    points: [
      'Automatic release switching',
      'Fans opt in once',
      'Momentum keeps compounding',
    ],
  },
] as const;

export const HOME_SECONDARY_MODULES: readonly HomeSecondaryModule[] = [
  {
    id: 'shows',
    title: 'Sell out every show.',
    body: 'Lead with the next date. Open the full run when fans want more.',
    showcaseState: 'tour',
  },
  {
    id: 'booking',
    title: 'Never miss a booking.',
    body: 'If someone wants to hire you, they should not have to spend fifteen minutes hunting for the right email address.',
    showcaseState: 'contact',
  },
  {
    id: 'catalog',
    title: 'One profile.',
    body: 'One place for songs, shows, support, and business.',
    showcaseState: 'catalog',
  },
] as const;

export const HOME_SPEC_FACTS: readonly HomeSpecFact[] = [
  { id: 'one-link', value: 'One profile link' },
  { id: 'auto-switching', value: 'Automatic switching' },
  { id: 'video-ready', value: 'Video-ready states' },
  { id: 'email-notifications', value: 'Email notifications built in' },
  { id: 'tour-mode', value: 'Tour dates built in' },
  { id: 'tips-and-contacts', value: 'Tips + contacts included' },
  { id: 'audience-crm', value: 'Audience CRM included' },
] as const;

export const HOME_SPEC_CARDS: readonly HomeSpecCard[] = [
  {
    id: 'opinionated-design',
    title: 'Opinionated by Design.',
    body: 'Conversion-first by default. No templates to break. No endless customization rabbit hole. One profile language fans learn once.',
  },
  {
    id: 'automatic-default',
    title: 'Automatic by default.',
    body: 'Presave, live release, video, and follow-up should not require manual page rebuilds.',
  },
  {
    id: 'own-the-relationship',
    title: 'Own the relationship.',
    body: 'Fans should not disappear into recommendation engines after the click.',
  },
  {
    id: 'audience-depth',
    title: 'See who’s paying attention.',
    body: 'Audience capture, profiles, and CRM depth belong in the system, not in scattered tools.',
  },
] as const;
