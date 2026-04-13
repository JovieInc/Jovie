import type { ProfileShowcaseStateId } from '@/features/profile/contracts';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

export type HomeProofAvailability = 'hidden' | 'visible';

export type HomeStorySceneId =
  | 'one-link'
  | 'before-the-drop'
  | 'when-its-out'
  | 'fans-opt-in-once'
  | 'on-the-road'
  | 'support'
  | 'business-calling'
  | 'never-goes-dark';

export interface HomeStoryScene {
  readonly id: HomeStorySceneId;
  readonly headline: string;
  readonly body: string;
  readonly showcaseState: ProfileShowcaseStateId;
}

interface HomeHeroContent {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly vanityUrl: string;
  readonly primaryCtaLabel: string;
  readonly secondaryCtaLabel: string;
}

interface HomeInfrastructureSignal {
  readonly id: 'sync' | 'switch' | 'tasks' | 'notifications';
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
}

export const HOME_HERO_CONTENT: HomeHeroContent = {
  eyebrow: 'For artists',
  title: 'The link your music deserves.',
  body: 'One artist profile that updates itself for every release and notifies fans automatically.',
  vanityUrl: 'jov.ie/you',
  primaryCtaLabel: 'Claim your profile',
  secondaryCtaLabel: 'See it live',
};

export const HOME_STORY_ARTIST = {
  name: TIM_WHITE_PROFILE.name,
  handle: TIM_WHITE_PROFILE.handle,
  avatarSrc: TIM_WHITE_PROFILE.avatarSrc,
} as const;

export const HOME_STORY_SCENES: readonly HomeStoryScene[] = [
  {
    id: 'one-link',
    headline: 'One link.',
    body: 'Put Jovie in your bio once. The profile changes when the moment changes.',
    showcaseState: 'default',
  },
  {
    id: 'before-the-drop',
    headline: 'Before the drop.',
    body: 'It becomes a countdown with presave and fan signup.',
    showcaseState: 'presave',
  },
  {
    id: 'when-its-out',
    headline: "When it's out.",
    body: 'It becomes the best place to listen.',
    showcaseState: 'listen',
  },
  {
    id: 'fans-opt-in-once',
    headline: 'Fans opt in once.',
    body: 'Jovie brings them back automatically when new music drops.',
    showcaseState: 'subscribe',
  },
  {
    id: 'on-the-road',
    headline: "When you're on the road.",
    body: 'The latest date shows first. The full tour is one pull away.',
    showcaseState: 'tour',
  },
  {
    id: 'support',
    headline: 'When they want to support.',
    body: 'Tips live inside the profile. Support can turn into a lasting fan connection.',
    showcaseState: 'tip',
  },
  {
    id: 'business-calling',
    headline: 'When business comes calling.',
    body: 'Booking, management, and press each have a clear path.',
    showcaseState: 'contact',
  },
  {
    id: 'never-goes-dark',
    headline: 'It never goes dark.',
    body: 'Between drops, the profile still works: music, support, shows, and contact stay live.',
    showcaseState: 'catalog',
  },
] as const;

export const HOME_INFRASTRUCTURE_SIGNALS: readonly HomeInfrastructureSignal[] =
  [
    {
      id: 'sync',
      eyebrow: 'Release Sync',
      title: 'Import lands in one place.',
      body: 'Release artwork, title, and timing stay aligned with the current moment instead of getting rebuilt by hand.',
    },
    {
      id: 'switch',
      eyebrow: 'Timed Switch',
      title: 'Mode changes when the release does.',
      body: 'Presave turns into listen without swapping links or breaking the artist bio.',
    },
    {
      id: 'tasks',
      eyebrow: 'Launch Tasks',
      title: 'The rollout stays on track.',
      body: 'Checklist state keeps the launch sequence visible so the same release playbook does not need to be rebuilt.',
    },
    {
      id: 'notifications',
      eyebrow: 'Artist Notifications',
      title: 'Fans hear back in the artist voice.',
      body: 'Notifications stay branded and tied to the release moment instead of sending fans into a generic funnel.',
    },
  ] as const;
