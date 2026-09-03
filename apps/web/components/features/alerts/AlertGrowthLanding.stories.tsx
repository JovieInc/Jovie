import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AlertGrowthLanding } from './AlertGrowthLanding';

const meta = {
  title: 'Features/Alerts/AlertGrowthLanding',
  component: AlertGrowthLanding,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['artist', 'disabled'],
    },
  },
} satisfies Meta<typeof AlertGrowthLanding>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
