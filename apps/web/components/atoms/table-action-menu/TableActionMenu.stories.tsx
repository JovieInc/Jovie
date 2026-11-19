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

/** No actions apply to this row yet: the trigger opens an empty menu. */
export const EmptyItems: Story = {
  args: {
    open: true,
    // Non-modal so the open-menu audit does not aria-hide the page behind
    // the menu (axe aria-hidden-focus).
    modal: false,
    items: [],
  },
};

/** Long labels and sub-text stay inside the compact menu width. */
export const LongContentLabels: Story = {
  args: {
    open: true,
    modal: false,
    items: [
      {
        id: 'copy-title',
        label:
          'Copy The Extraordinarily Long Album Title (Deluxe Anniversary Remastered Edition)',
        icon: Copy,
        subText: 'Includes every featured artist and the full edition name',
        onClick: () => undefined,
      },
      { id: 'separator', label: '' },
      {
        id: 'delete',
        label: 'Delete this release from every territory and storefront',
        variant: 'destructive',
        onClick: () => undefined,
      },
    ],
  },
};

export const RtlActions: Story = {
  args: {
    open: true,
    modal: false,
    items: [
      {
        id: 'copy',
        label: 'نسخ العنوان',
        icon: Copy,
        onClick: () => undefined,
      },
      {
        id: 'view',
        label: 'عرض في الملف الشخصي',
        icon: Eye,
        onClick: () => undefined,
      },
    ],
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
