import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Inbox } from 'lucide-react';
import { type ReactNode, useLayoutEffect } from 'react';
import { RenderedFamily } from '@/.storybook/rendered-family';
import { Tooltip } from './Tooltip';

const meta = {
  title: 'Shell/Tooltip',
  component: Tooltip,
  parameters: { layout: 'centered' },
  args: {
    children: (
      <Button type='button' variant='secondary'>
        Audience
      </Button>
    ),
    label: 'Open audience',
    defaultOpen: true,
  },
  tags: ['autodocs'],
  decorators: [
    Story => (
      <RenderedFamily name='Tooltip' owner='Tooltip' interactive>
        <div className='p-4'>
          <Story />
        </div>
      </RenderedFamily>
    ),
  ],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Label: Story = {};

export const Shortcut: Story = {
  args: {
    shortcut: { keys: 'G A', description: 'Open audience' },
  },
};

export const LongLabel: Story = {
  args: {
    label: 'Ask Jovie about audience engagement over the last quarter',
  },
};

export const InputSwitching: Story = { args: { defaultOpen: false } };
export const Ineligible: Story = { args: { disabled: true } };
export const ListPlacement: Story = {
  args: { side: 'bottom', align: 'start' },
};

/** Partial: an icon-only trigger with a label and no optional shortcut. */
export const PartialLabelOnly: Story = {
  args: {
    children: (
      <Button type='button' variant='secondary' size='icon' aria-label='Inbox'>
        <Inbox className='size-4' aria-hidden='true' />
      </Button>
    ),
    label: 'Inbox',
    side: 'right',
  },
};

/**
 * The tooltip portals to document.body, so an RTL page sets the direction on
 * the document root; the story does the same and restores it on unmount.
 */
function RtlDocument({ children }: { readonly children: ReactNode }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('dir');
    root.setAttribute('dir', 'rtl');
    return () => {
      if (previous === null) root.removeAttribute('dir');
      else root.setAttribute('dir', previous);
    };
  }, []);
  return <div dir='rtl'>{children}</div>;
}

export const Rtl: Story = {
  args: {
    children: (
      <Button type='button' variant='secondary'>
        الجمهور
      </Button>
    ),
    label: 'افتح صفحة الجمهور لمراجعة التفاعل خلال الربع الأخير',
    shortcut: { keys: 'G A', description: 'افتح الجمهور' },
  },
  render: args => (
    <RtlDocument>
      <Tooltip {...args} />
    </RtlDocument>
  ),
};
