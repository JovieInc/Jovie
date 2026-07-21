import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import { SimpleTooltip } from './simple-tooltip';
import { TooltipProvider } from './tooltip';

const meta: Meta<typeof SimpleTooltip> = {
  title: 'UI/Atoms/SimpleTooltip',
  component: SimpleTooltip,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Simplified tooltip wrapper for common use cases — wrap any single trigger element and pass the tooltip content as a prop.',
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
    content: {
      control: { type: 'text' },
      description: 'Content displayed in the tooltip',
    },
    side: {
      control: { type: 'select' },
      options: ['top', 'right', 'bottom', 'left'],
      description: 'Which side of the trigger to show the tooltip',
    },
    sideOffset: {
      control: { type: 'number' },
      description: 'Distance from the trigger element in pixels',
    },
    showArrow: {
      control: { type: 'boolean' },
      description: 'Whether to show the arrow pointer',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    content: 'Save changes',
    children: <Button variant='secondary'>Hover me</Button>,
  },
};

export const WithArrow: Story = {
  args: {
    content: 'Tooltip with arrow pointer',
    showArrow: true,
    children: <Button variant='secondary'>Hover me</Button>,
  },
};

export const SideRight: Story = {
  args: {
    content: 'Tooltip on the right',
    side: 'right',
    children: <Button variant='secondary'>Hover me</Button>,
  },
};

/**
 * The trigger is auto-focused so Radix opens the tooltip on mount —
 * Chromatic captures the tooltip surface deterministically.
 */
export const VisibleOpen: Story = {
  render: () => (
    <SimpleTooltip content='Tooltip captured in the open state'>
      <Button variant='secondary' autoFocus>
        Focused trigger
      </Button>
    </SimpleTooltip>
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
