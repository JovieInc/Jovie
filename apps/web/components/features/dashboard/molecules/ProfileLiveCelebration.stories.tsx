import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProfileLiveCelebration } from './ProfileLiveCelebration';

const meta = {
  title: 'Features/Dashboard/Molecules/ProfileLiveCelebration',
  component: ProfileLiveCelebration,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['username', 'onComplete'],
    },
  },
} satisfies Meta<typeof ProfileLiveCelebration>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
