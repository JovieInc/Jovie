import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RailToggleButton } from './RailToggleButton';

const meta = {
  title: 'Atoms/RailToggleButton',
  component: RailToggleButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    side: 'left',
    open: true,
    openLabel: 'Collapse sidebar',
    closedLabel: 'Expand sidebar',
    onToggle: () => undefined,
  },
} satisfies Meta<typeof RailToggleButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LeftOpen: Story = {};

export const LeftClosed: Story = {
  args: {
    open: false,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const RightOpen: Story = {
  args: {
    side: 'right',
    openLabel: 'Collapse details',
    closedLabel: 'Expand details',
  },
};
