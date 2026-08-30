import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DspLogo } from './DspLogo';

const meta = {
  title: 'Atoms/DspLogo',
  component: DspLogo,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof DspLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Spotify: Story = {
  args: {
    provider: 'spotify',
  },
};

export const AppleMusic: Story = {
  args: {
    provider: 'apple_music',
    height: 24,
  },
};

export const TikTok: Story = {
  args: {
    provider: 'tiktok',
    className: 'text-primary-token',
  },
};
