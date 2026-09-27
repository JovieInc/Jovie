import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SaveStatusIndicator } from './SaveStatusIndicator';

const meta: Meta<typeof SaveStatusIndicator> = {
  title: 'Dashboard/Molecules/SaveStatusIndicator',
  component: SaveStatusIndicator,
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

type Story = StoryObj<typeof SaveStatusIndicator>;

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
