import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfilePreviewBento } from './ProfilePreviewBento';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

const meta = {
  title: 'Profile/ProfilePreviewBento',
  component: ProfilePreviewBento,
  parameters: {
    layout: 'centered',
  },
  args: {
    artist: PROFILE_STORY_ARTIST,
    socialLinks: [],
    profileHref: '/timwhite',
    phoneFrameClassName: 'h-120 w-57',
  },
  decorators: [
    Story => (
      <div className='bg-base p-6' style={{ width: 380 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProfilePreviewBento>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLiveBadgeAndCaption: Story = {
  args: {
    showLiveBadge: true,
    caption: 'Your live profile',
  },
};

/** Onboarding rail: the DSP-match strip sits in flow under the phone. */
export const WithOverlay: Story = {
  args: {
    caption: 'Preview — not claimed yet',
    overlay: (
      <div
        className='flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2 py-1.5 text-white backdrop-blur-xl dark:text-white'
        data-testid='onboarding-dsp-match-strip'
      >
        {['Spotify', 'Apple Music'].map(label => (
          <span
            key={label}
            className='inline-flex h-7 items-center rounded-full bg-white px-2 text-2xs font-semibold text-black dark:bg-white dark:text-black'
          >
            {label}
          </span>
        ))}
      </div>
    ),
  },
};
