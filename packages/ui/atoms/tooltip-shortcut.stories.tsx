import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Bold, Share2 } from 'lucide-react';
import { Button } from './button';
import { TooltipShortcut } from './tooltip-shortcut';

const meta: Meta<typeof TooltipShortcut> = {
  title: 'UI/Atoms/TooltipShortcut',
  component: TooltipShortcut,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <TooltipShortcut label='Open command palette' shortcut='⌘K' defaultOpen>
      <Button variant='ghost'>Command</Button>
    </TooltipShortcut>
  ),
};

export const RichExplanation: Story = {
  render: () => (
    <TooltipShortcut
      label='Exports every visible row using the active filters.'
      contentVariant='rich'
      defaultOpen
      side='bottom'
    >
      <Button variant='secondary'>Export</Button>
    </TooltipShortcut>
  ),
};

export const PartialWithoutShortcut: Story = {
  render: () => (
    <TooltipShortcut label='Bold' defaultOpen>
      <Button variant='ghost' size='icon' aria-label='Bold'>
        <Bold className='size-4' aria-hidden='true' />
      </Button>
    </TooltipShortcut>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Optional shortcut omitted: the tooltip shows the label alone and renders no empty keycap.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <TooltipShortcut
      label='Share the public profile link with your fans, collaborators and label team'
      shortcut='⌘⇧S'
      contentVariant='rich'
      defaultOpen
      side='bottom'
    >
      <Button variant='secondary'>Share</Button>
    </TooltipShortcut>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A long label with a shortcut in the rich contract wraps within the tooltip width while the keycap keeps its size.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl'>
      <TooltipShortcut
        label='مشاركة رابط الملف الشخصي العام مع المعجبين'
        shortcut='⌘⇧S'
        contentVariant='rich'
        defaultOpen
        side='bottom'
      >
        <Button variant='secondary' size='icon' aria-label='مشاركة'>
          <Share2 className='size-4' aria-hidden='true' />
        </Button>
      </TooltipShortcut>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Right-to-left label with a shortcut: the Arabic text wraps in the rich contract and the keycap stays attached at the end.',
      },
    },
  },
};
