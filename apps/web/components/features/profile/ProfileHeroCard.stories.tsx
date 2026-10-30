import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileHeroCard } from './ProfileHeroCard';
import {
  PROFILE_STORY_ARTIST,
  profileStoryNoop,
} from './profile-story-fixture';

const meta = {
  title: 'Profile/ProfileHeroCard',
  component: ProfileHeroCard,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    artist: PROFILE_STORY_ARTIST,
    heroImageUrl: '/images/avatars/tim-white.jpg',
    latestRelease: {
      title: 'Never Say A Word',
      artworkUrl: '/images/avatars/tim-white.jpg',
      releaseDate: '2099-09-04T16:00:00.000Z',
      releaseType: 'single',
    },
    primaryAction: {
      label: 'Get tickets',
      href: '/timwhite/tour',
      external: false,
      onClick: profileStoryNoop,
      ariaLabel: 'Get Tim White tickets',
    },
    onPlayClick: profileStoryNoop,
    onBellClick: profileStoryNoop,
    spotlightLabel: 'Next show',
    spotlightValue: 'Brooklyn Steel',
    primaryActionKind: 'tickets',
    socialLinks: [],
    compact: false,
  },
} satisfies Meta<typeof ProfileHeroCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hero: Story = {
  render: args => (
    <div className='min-h-dvh bg-page'>
      <ProfileHeroCard {...args} />
    </div>
  ),
};

export const Compact: Story = {
  args: {
    compact: true,
    primaryActionKind: 'listen',
    primaryAction: {
      label: 'Listen now',
      href: '/timwhite/listen',
      external: false,
      onClick: profileStoryNoop,
      ariaLabel: 'Listen to Tim White',
    },
  },
};
