import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { Copy, ExternalLink, Pin, Share2, Star } from 'lucide-react';
import { fn } from 'storybook/test';
import type { DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { DrawerCardActionBar } from './DrawerCardActionBar';

const CanvasFrame: Decorator = function CanvasFrame(Story) {
  return (
    <div className='relative w-80 bg-surface-0'>
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
  title: 'Molecules/Drawer/DrawerCardActionBar States',
  component: DrawerCardActionBar,
  parameters: {
    layout: 'centered',
  },
  decorators: [CanvasFrame],
  args: {
    primaryActions: [
      { id: 'pin', label: 'Pin', icon: Pin, onClick: fn() },
      { id: 'share', label: 'Share', icon: Share2, onClick: fn() },
    ],
  },
} satisfies Meta<typeof DrawerCardActionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: one primary action with no overflow menu and no close. */
export const PartialSingleAction: Story = {
  args: {
    primaryActions: [{ id: 'pin', label: 'Pin', icon: Pin, onClick: fn() }],
  },
};

const longActions: DrawerHeaderAction[] = [
  {
    id: 'copy',
    label: 'Copy smart link to clipboard',
    icon: Copy,
    onClick: fn(),
  },
  {
    id: 'open',
    label: 'Open the release page in a new tab',
    icon: ExternalLink,
    onClick: fn(),
  },
  {
    id: 'favorite',
    label: 'Add to favorite releases',
    icon: Star,
    onClick: fn(),
  },
  { id: 'share', label: 'Share', icon: Share2, onClick: fn() },
];

/** Long content: long labels scroll inside the bar; only three show inline. */
export const LongContentLabels: Story = {
  args: {
    primaryActions: longActions,
    overflowActions: [
      { id: 'pin', label: 'Pin to the top', icon: Pin, onClick: fn() },
    ],
    onClose: fn(),
  },
};

/** Right-to-left: Arabic labels with the overflow menu inside an RTL card. */
export const RtlArabicActions: Story = {
  args: {
    primaryActions: [
      { id: 'pin', label: 'تثبيت', icon: Pin, onClick: fn() },
      { id: 'share', label: 'مشاركة', icon: Share2, onClick: fn() },
    ],
    overflowActions: [
      { id: 'favorite', label: 'المفضلة', icon: Star, onClick: fn() },
    ],
  },
  decorators: [RtlFrame],
};
