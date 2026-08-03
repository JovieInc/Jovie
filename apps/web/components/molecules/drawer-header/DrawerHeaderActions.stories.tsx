import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Copy, ExternalLink } from 'lucide-react';
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
