import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { MysteryReleasePage } from './MysteryReleasePage';

const meta = {
  title: 'Features/Release/MysteryReleasePage',
  component: MysteryReleasePage,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    revealDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    artist: {
      id: 'artist-1',
      name: TIM_WHITE_PROFILE.name,
      handle: TIM_WHITE_PROFILE.handle,
      avatarUrl: TIM_WHITE_PROFILE.avatarSrc,
    },
  },
} satisfies Meta<typeof MysteryReleasePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Countdown: Story = {};

export const Minimal: Story = {
  args: {
    minimal: true,
  },
};

/** Free plan: the countdown and sign-up are locked to a quiet teaser card. */
export const PermissionDeniedFreePlan: Story = {
  args: {
    minimal: true,
  },
};

/** A long artist name wraps under the art without crowding the countdown. */
export const LongContentArtistName: Story = {
  args: {
    artist: {
      id: 'artist-1',
      name: 'Tim White, The Midnight Strings Orchestra and Friends',
      handle: TIM_WHITE_PROFILE.handle,
      avatarUrl: TIM_WHITE_PROFILE.avatarSrc,
    },
  },
};

/** The reveal page inside a right-to-left page. */
export const Rtl: Story = {
  args: {
    artist: {
      id: 'artist-1',
      name: 'تيم وايت',
      handle: TIM_WHITE_PROFILE.handle,
      avatarUrl: TIM_WHITE_PROFILE.avatarSrc,
    },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
