import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { CopyableUrlRow } from './CopyableUrlRow';

const meta = {
  title: 'Molecules/CopyableUrlRow',
  component: CopyableUrlRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72 bg-surface-1 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    url: 'https://jov.ie/tim',
    onCopySuccess: fn(),
    onCopyError: fn(),
  },
} satisfies Meta<typeof CopyableUrlRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = {
  args: {
    size: 'sm',
  },
};

export const FlatSurface: Story = {
  args: {
    surface: 'flat',
  },
};

export const HoverOnlyActions: Story = {
  args: {
    actionsVisibility: 'hover',
  },
};
