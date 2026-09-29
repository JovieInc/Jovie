import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileSkeleton } from './ProfileSkeleton';

const meta = {
  title: 'Features/Profile/ProfileSkeleton',
  component: ProfileSkeleton,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ProfileSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
