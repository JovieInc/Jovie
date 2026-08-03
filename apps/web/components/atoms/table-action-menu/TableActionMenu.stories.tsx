import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Copy, Eye, FileCheck2 } from 'lucide-react';
import { TableActionMenu } from './TableActionMenu';

const meta: Meta<typeof TableActionMenu> = {
  title: 'Atoms/TableActionMenu',
  component: TableActionMenu,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['disabled'] },
  },
};

export default meta;
type Story = StoryObj<typeof TableActionMenu>;

export const SearchableEntityActions: Story = {
  args: {
    searchable: true,
    searchPlaceholder: 'Search actions',
    searchMode: 'recursive',
    items: [
      {
        id: 'status',
        label: 'Status',
        icon: FileCheck2,
        children: [
          { id: 'released', label: 'Released', onClick: () => undefined },
          { id: 'draft', label: 'Draft', onClick: () => undefined },
        ],
      },
      {
        id: 'visibility',
        label: 'Visibility',
        icon: Eye,
        children: [
          { id: 'shown', label: 'Shown on Profile', onClick: () => undefined },
        ],
      },
      {
        id: 'copy',
        label: 'Copy',
        icon: Copy,
        children: [
          { id: 'copy-title', label: 'Title', onClick: () => undefined },
          { id: 'copy-isrc', label: 'ISRC', onClick: () => undefined },
        ],
      },
    ],
  },
};
