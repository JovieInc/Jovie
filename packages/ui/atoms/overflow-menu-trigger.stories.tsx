import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OverflowMenuTrigger } from './overflow-menu-trigger';

const meta: Meta<typeof OverflowMenuTrigger> = {
  title: 'UI/Atoms/OverflowMenuTrigger',
  component: OverflowMenuTrigger,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Pill-shaped "More" button for tab overflow menus. Shows an accent dot when the active tab is hidden inside the overflow menu.',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    hasActiveOverflow: false,
  },
  argTypes: {
    hasActiveOverflow: {
      control: { type: 'boolean' },
      description: 'Whether the active tab is hidden in the overflow menu',
    },
    variant: {
      control: { type: 'select' },
      options: ['drawer', 'segment'],
      description: 'Visual context — drawer navigation or segmented tabs',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Disabled state',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ActiveOverflow: Story = {
  args: {
    hasActiveOverflow: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Accent dot indicates the currently active tab lives inside the overflow menu.',
      },
    },
  },
};

export const SegmentVariant: Story = {
  args: {
    variant: 'segment',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
