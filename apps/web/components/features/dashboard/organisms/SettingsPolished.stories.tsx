import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SettingsPolished } from './SettingsPolished';

const meta = {
  title: 'Features/Dashboard/Organisms/SettingsPolished',
  component: SettingsPolished,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['artist'],
    },
  },
} satisfies Meta<typeof SettingsPolished>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
