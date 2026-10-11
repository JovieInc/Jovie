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
