import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InstallBanner } from './InstallBanner';

const meta = {
  title: 'Shell/InstallBanner',
  component: InstallBanner,
  parameters: {
    jovie: {
      uncoveredProps: ['disabled'],
    },
    layout: 'centered',
  },
} satisfies Meta<typeof InstallBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
