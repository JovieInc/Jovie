import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { UpdateAvailablePill } from './UpdateAvailablePill';

const meta = {
  title: 'Molecules/UpdateAvailablePill',
  component: UpdateAvailablePill,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof UpdateAvailablePill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};
