import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AvailableDSP } from '@/lib/dsp';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';
import { StaticListenInterface } from './StaticListenInterface';

const storyDsps = [
  {
    key: 'spotify',
    name: 'Spotify',
    url: 'https://open.spotify.com/artist/4u',
    config: {
      name: 'Spotify',
      color: '#1DB954',
      textColor: '#FFFFFF',
      logoSvg: '<svg />',
    },
  },
  {
    key: 'apple_music',
    name: 'Apple Music',
    url: 'https://music.apple.com/artist/4u',
    config: {
      name: 'Apple Music',
      color: '#FA243C',
      textColor: '#FFFFFF',
      logoSvg: '<svg />',
    },
  },
] satisfies AvailableDSP[];

const meta = {
  title: 'Profile/StaticListenInterface',
  component: StaticListenInterface,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    jovie: {
      uncoveredProps: [
        'enableDynamicEngagement',
        'containerClassName',
        'emptyStateClassName',
        'providerButtonClassName',
        'helpTextClassName',
        'hideHelpText',
      ],
    },
  },
  args: {
    artist: PROFILE_STORY_ARTIST,
    handle: 'timwhite',
    dspsOverride: storyDsps,
    renderMode: 'interactive',
  },
} satisfies Meta<typeof StaticListenInterface>;

export default meta;

export const ListenLinks: StoryObj<typeof meta> = {};

export const PreviewRows: StoryObj<typeof meta> = {
  args: { renderMode: 'preview' },
};
