import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PublicProfileFixture } from './PublicProfileFixture';

const meta: Meta<typeof PublicProfileFixture> = {
  title: 'Profile/PublicProfileFixture',
  component: PublicProfileFixture,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof PublicProfileFixture>;

export const Unclaimed: Story = {
  args: { state: 'unclaimed' },
};

export const LongName: Story = {
  args: { longName: true, state: 'unclaimed' },
};

export const Claimed: Story = {
  args: { state: 'claimed' },
};
