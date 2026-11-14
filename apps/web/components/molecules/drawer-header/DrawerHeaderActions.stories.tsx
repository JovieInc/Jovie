import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { DrawerHeaderActions } from './DrawerHeaderActions';

const meta: Meta<typeof DrawerHeaderActions> = {
  title: 'Molecules/DrawerHeaderActions',
  component: DrawerHeaderActions,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['disabled'] },
  },
};

export default meta;
type Story = StoryObj<typeof DrawerHeaderActions>;

export const SearchableOverflow: Story = {
  args: {
    searchable: true,
    searchPlaceholder: 'Search actions',
    searchMode: 'recursive',
    primaryActions: [
      {
        id: 'open',
        label: 'Open entity',
        icon: ExternalLink,
        onClick: () => undefined,
      },
    ],
    overflowActions: [
      {
        id: 'copy',
        label: 'Copy title',
        icon: Copy,
        onClick: () => undefined,
      },
    ],
  },
};

/** Canonical ghost/sm IconButtons: link action, copied state and overflow. */
export const CopiedStateWithLink: Story = {
  args: {
    primaryActions: [
      {
        id: 'open',
        label: 'Open entity',
        icon: ExternalLink,
        href: '/app/library',
      },
      {
        id: 'copy',
        label: 'Copy link',
        icon: Copy,
        activeIcon: Check,
        isActive: true,
        onClick: () => undefined,
      },
    ],
    onClose: () => undefined,
  },
};

/** No primary or overflow actions: only the small-screen Close remains. */
export const EmptyActions: Story = {
  args: {
    primaryActions: [],
    onClose: () => undefined,
  },
};

/** One primary action without an active icon, no overflow and no Close. */
export const PartialSingleAction: Story = {
  args: {
    primaryActions: [
      {
        id: 'copy',
        label: 'Copy link',
        icon: Copy,
        onClick: () => undefined,
      },
    ],
  },
};

export const LongContent: Story = {
  args: {
    primaryActions: [
      {
        id: 'open',
        label: 'Open Midnight Drive (Extended Club Mix) in a new tab',
        icon: ExternalLink,
        onClick: () => undefined,
      },
    ],
    overflowActions: [
      {
        id: 'copy-smart-link',
        label: 'Copy the smart link for every streaming service',
        icon: Copy,
        onClick: () => undefined,
      },
      {
        id: 'copy-isrc',
        label: 'Copy ISRC and UPC codes for distributor support',
        icon: Copy,
        onClick: () => undefined,
      },
    ],
    onClose: () => undefined,
  },
};

export const Rtl: Story = {
  args: {
    primaryActions: [
      {
        id: 'open',
        label: 'فتح العنصر',
        icon: ExternalLink,
        onClick: () => undefined,
      },
    ],
    overflowActions: [
      {
        id: 'copy',
        label: 'نسخ العنوان',
        icon: Copy,
        onClick: () => undefined,
      },
    ],
    onClose: () => undefined,
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
