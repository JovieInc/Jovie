import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SettingsRow } from './SettingsRow';

const meta = {
  title: 'Shell/SettingsRow',
  component: SettingsRow,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['label', 'control'],
    },
  },
} satisfies Meta<typeof SettingsRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
