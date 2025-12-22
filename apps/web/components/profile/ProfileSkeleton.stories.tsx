import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileSkeleton } from './ProfileSkeleton';

const meta: Meta<typeof ProfileSkeleton> = {
  title: 'Profile/ProfileSkeleton',
  component: ProfileSkeleton,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof ProfileSkeleton>;

export const Default: Story = {};

export const LightMode: Story = {
  parameters: {
    backgrounds: { default: 'light' },
  },
};

export const DarkMode: Story = {
  parameters: {
    backgrounds: { default: 'dark' },
  },
  decorators: [
    Story => (
      <div className='dark'>
        <Story />
      </div>
    ),
  ],
};
