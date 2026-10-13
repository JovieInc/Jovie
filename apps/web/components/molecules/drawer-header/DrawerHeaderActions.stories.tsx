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
