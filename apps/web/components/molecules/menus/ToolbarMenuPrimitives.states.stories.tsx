import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@jovie/ui';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { Music } from 'lucide-react';
import { expect, fn, within } from 'storybook/test';
import { ToolbarMenuChoiceItem } from './ToolbarMenuPrimitives';

// Non-modal for the same reason as ToolbarMenuPrimitives.stories.tsx: a modal
// Radix menu aria-hides the canvas around the portaled content.
const openMenu: Decorator = function OpenToolbarMenu(Story) {
  return (
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='sm'>
          Open
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-48'>
        <Story />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/** State coverage for the toolbar choice row; selected, disabled and icon rows live in ToolbarMenuPrimitives.stories.tsx. */
const meta = {
  title: 'Molecules/Menus/ToolbarMenuPrimitives States',
  component: ToolbarMenuChoiceItem,
  parameters: { layout: 'centered' },
  decorators: [openMenu],
  args: { label: 'Newest first', active: false, onSelect: fn() },
} satisfies Meta<typeof ToolbarMenuChoiceItem>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a selected row with a trailing count but no leading icon. */
export const PartialTrailingOnly: Story = {
  args: { active: true, trailingVisual: <span>12</span> },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByRole('menuitem', { name: /Newest first/ })
    ).toHaveAttribute('data-selected', 'true');
  },
};

/** Long content: a long label truncates without moving the trailing check. */
export const LongContentTruncatedLabel: Story = {
  args: {
    active: true,
    leadingVisual: <Music className='h-3.5 w-3.5' />,
    label:
      'Sort by the most recently released single, EP or album across every connected artist profile',
  },
};

/** Right-to-left: an Arabic choice row inside an RTL menu. */
export const RtlArabic: Story = {
  args: {
    label: 'الأحدث أولاً',
    active: true,
    leadingVisual: <Music className='h-3.5 w-3.5' />,
  },
  decorators: [rtl],
};
