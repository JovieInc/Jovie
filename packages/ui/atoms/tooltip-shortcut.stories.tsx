import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import { TooltipProvider } from './tooltip';
import { TooltipShortcut } from './tooltip-shortcut';

const meta: Meta<typeof TooltipShortcut> = {
  title: 'UI/Atoms/TooltipShortcut',
  component: TooltipShortcut,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Tooltip wrapper that pairs a label with an optional keyboard shortcut, rendered with the centralized Kbd tooltip variant.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    Story => (
      <TooltipProvider delayDuration={0}>
        <div className='p-8'>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  argTypes: {
    label: {
      control: { type: 'text' },
      description: 'Label text displayed in the tooltip',
    },
    shortcut: {
      control: { type: 'text' },
      description: 'Optional keyboard shortcut (e.g. "⌘S", "⌘/Ctrl B")',
    },
    side: {
      control: { type: 'select' },
      options: ['top', 'right', 'bottom', 'left'],
      description: 'Which side of the trigger to show the tooltip',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'Save',
    shortcut: '⌘S',
    children: <Button variant='secondary'>Save</Button>,
  },
};

export const WithoutShortcut: Story = {
  args: {
    label: 'More options',
    children: <Button variant='secondary'>Options</Button>,
  },
};

export const SideBottom: Story = {
  args: {
    label: 'Toggle sidebar',
    shortcut: '⌘B',
    side: 'bottom',
    children: <Button variant='secondary'>Sidebar</Button>,
  },
};

/**
 * The trigger is auto-focused so Radix opens the tooltip on mount —
 * Chromatic captures the label + Kbd tooltip surface deterministically.
 */
export const VisibleOpen: Story = {
  render: () => (
    <TooltipShortcut label='Save' shortcut='⌘S'>
      <Button variant='secondary' autoFocus>
        Focused trigger
      </Button>
    </TooltipShortcut>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Auto-focusing the trigger opens the tooltip on mount so visual regression captures the open surface.',
      },
    },
  },
};
