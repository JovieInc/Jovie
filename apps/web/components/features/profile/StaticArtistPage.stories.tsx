import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';
import { StaticArtistPage } from './StaticArtistPage';

const meta: Meta<typeof StaticArtistPage> = {
  title: 'Profile/StaticArtistPage',
  component: StaticArtistPage,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
  args: {
    mode: 'profile',
    artist: PROFILE_STORY_ARTIST,
    socialLinks: [],
    contacts: [],
    subtitle: 'Artist profile',
    showBackButton: false,
    catalogLoadFailed: false,
    releases: [
      {
        id: 'release-1',
        title: 'Never Say A Word',
        slug: 'never-say-a-word',
        releaseType: 'single',
        releaseDate: '2026-08-01',
        artworkUrl: '/images/avatars/tim-white.jpg',
        artistNames: ['Tim White'],
      },
    ],
  },
};

export default meta;

export const Home: StoryObj<typeof StaticArtistPage> = {
  render: args => (
    <div className='min-h-dvh bg-base'>
      <StaticArtistPage {...args} />
    </div>
  ),
};
