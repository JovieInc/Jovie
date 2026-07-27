import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Kbd } from './kbd';

const meta: Meta<typeof Kbd> = {
  title: 'UI/Atoms/Kbd',
  component: Kbd,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Keyboard shortcut badge. Use the `tooltip` variant inside tooltips for proper contrast against the tooltip surface.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'tooltip'],
      description: 'Visual variant',
    },
    children: {
      control: { type: 'text' },
      description: 'Key label (e.g. "⌘S", "Esc")',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: '⌘K',
  },
};

export const Combination: Story = {
  render: () => (
    <span className='flex items-center gap-1'>
      <Kbd>⌘</Kbd>
      <Kbd>⇧</Kbd>
      <Kbd>P</Kbd>
    </span>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Multi-key combos render as one Kbd per key.',
      },
    },
  },
};

export const TooltipVariant: Story = {
  render: () => (
    <span className='inline-flex items-center gap-2 rounded-md bg-neutral-800 px-3 py-2'>
      <span className='text-xs text-white'>Save changes</span>
      <Kbd variant='tooltip'>⌘S</Kbd>
    </span>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The `tooltip` variant keeps contrast on the dark tooltip surface (shown here on a mock surface).',
      },
    },
  },
};
