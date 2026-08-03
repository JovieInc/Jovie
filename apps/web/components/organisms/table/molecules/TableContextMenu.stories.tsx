import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Copy, Eye } from 'lucide-react';
import { TableContextMenu } from './TableContextMenu';

const meta: Meta<typeof TableContextMenu> = {
  title: 'Organisms/Table/TableContextMenu',
  component: TableContextMenu,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof TableContextMenu>;

export const SearchableRowActions: Story = {
  args: {
    searchable: true,
    searchPlaceholder: 'Search actions',
    searchMode: 'recursive',
    items: [
      {
        id: 'visibility',
        label: 'Visibility',
        icon: <Eye className='h-3.5 w-3.5' />,
        items: [
          { id: 'shown', label: 'Shown on Profile', onClick: () => undefined },
        ],
      },
      {
        id: 'copy',
        label: 'Copy',
        icon: <Copy className='h-3.5 w-3.5' />,
        onClick: () => undefined,
      },
    ],
    children: (
      <div className='rounded-md border border-subtle bg-surface px-4 py-3 text-sm text-primary-token'>
        Right-click this row
      </div>
    ),
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    items: [{ id: 'copy', label: 'Copy', onClick: () => undefined }],
    children: (
      <div className='rounded-md border border-subtle bg-surface px-4 py-3 text-sm text-primary-token'>
        Context actions unavailable
      </div>
    ),
  },
};
