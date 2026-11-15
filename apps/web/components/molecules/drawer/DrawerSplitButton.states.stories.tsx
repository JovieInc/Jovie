import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { Pin, Share2, Trash2 } from 'lucide-react';
import { fn } from 'storybook/test';
import { DrawerSplitButton } from './DrawerSplitButton';

const menuItems = [
  {
    id: 'share',
    type: 'action' as const,
    label: 'Share',
    icon: <Share2 className='h-3.5 w-3.5' />,
    onClick: fn(),
  },
  {
    id: 'delete',
    type: 'action' as const,
    label: 'Delete',
    icon: <Trash2 className='h-3.5 w-3.5' />,
    onClick: fn(),
    variant: 'destructive' as const,
  },
];

const CanvasFrame: Decorator = function CanvasFrame(Story) {
  return (
    <div className='bg-surface-0 p-3'>
      <Story />
    </div>
  );
};

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Molecules/Drawer/DrawerSplitButton States',
  component: DrawerSplitButton,
  parameters: {
    layout: 'centered',
  },
  decorators: [CanvasFrame],
  args: {
    primaryAction: {
      ariaLabel: 'Pin',
      label: 'Pin',
      icon: <Pin className='h-3.5 w-3.5' />,
      onClick: fn(),
    },
    menuItems,
  },
} satisfies Meta<typeof DrawerSplitButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no primary action and no menu items, so nothing renders. */
export const EmptyNoActions: Story = {
  args: {
    primaryAction: undefined,
    menuItems: [],
  },
};

/** Partial: only the menu half, with no primary action. */
export const PartialMenuOnly: Story = {
  args: {
    primaryAction: undefined,
  },
};

/** Long content: a long primary label stays on one line beside the menu. */
export const LongContentPrimaryLabel: Story = {
  args: {
    primaryAction: {
      ariaLabel: 'Pin this release to the top of the catalog',
      label: 'Pin this release to the top of the catalog',
      icon: <Pin className='h-3.5 w-3.5' />,
      onClick: fn(),
    },
  },
};

/** Right-to-left: an Arabic primary label inside an RTL drawer. */
export const RtlArabicLabel: Story = {
  args: {
    primaryAction: {
      ariaLabel: 'تثبيت',
      label: 'تثبيت',
      icon: <Pin className='h-3.5 w-3.5' />,
      onClick: fn(),
    },
    menuAriaLabel: 'إجراءات أخرى',
  },
  decorators: [RtlFrame],
};
