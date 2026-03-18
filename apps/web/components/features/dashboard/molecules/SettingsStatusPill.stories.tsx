import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SettingsStatusPill } from './SettingsStatusPill';

const meta: Meta<typeof SettingsStatusPill> = {
  title: 'Dashboard/Molecules/SettingsStatusPill',
  component: SettingsStatusPill,
  parameters: {
    layout: 'padded',
  },
  argTypes: {
    state: {
      control: { type: 'select' },
      options: ['saving', 'saved'],
    },
    className: { control: 'text' },
  },
};

export default meta;

type Story = StoryObj<typeof SettingsStatusPill>;

export const Saving: Story = {
  args: {
    state: 'saving',
  },
};

export const Saved: Story = {
  args: {
    state: 'saved',
  },
};
