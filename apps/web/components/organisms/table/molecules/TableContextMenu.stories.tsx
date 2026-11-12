import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Copy, Eye } from 'lucide-react';
import { userEvent, within } from 'storybook/test';
import { type ContextMenuItemType, TableContextMenu } from './TableContextMenu';

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

const ROW_CLASS =
  'rounded-md border border-subtle bg-surface px-4 py-3 text-sm text-primary-token';

/** Right-clicks the row so the story shows the open menu. */
const openMenu: Story['play'] = async ({ canvasElement }) => {
  const row = within(canvasElement).getByTestId('context-row');
  await userEvent.pointer({ keys: '[MouseRight]', target: row });
};

export const LoadingAsyncActions: Story = {
  args: {
    getItems: () => new Promise<ContextMenuItemType[]>(() => undefined),
    children: (
      <div data-testid='context-row' className={ROW_CLASS}>
        Right-click to load actions
      </div>
    ),
  },
  play: openMenu,
};

export const EmptyNoActions: Story = {
  args: {
    items: [],
    children: (
      <div data-testid='context-row' className={ROW_CLASS}>
        This row has no context actions
      </div>
    ),
  },
};

export const ErrorActionsFailedToLoad: Story = {
  args: {
    getItems: () => Promise.reject(new Error('Actions request failed')),
    children: (
      <div data-testid='context-row' className={ROW_CLASS}>
        Right-click: actions could not load
      </div>
    ),
  },
  play: openMenu,
};

export const OfflineActionsUnavailable: Story = {
  args: {
    getItems: () => Promise.reject(new TypeError('Failed to fetch')),
    children: (
      <div data-testid='context-row' className={ROW_CLASS}>
        Right-click while offline
      </div>
    ),
  },
  play: openMenu,
};

export const PartialSomeActionsDisabled: Story = {
  args: {
    items: [
      {
        id: 'copy',
        label: 'Copy Link',
        icon: <Copy className='h-3.5 w-3.5' />,
        onClick: () => undefined,
      },
      { id: 'edit', label: 'Edit Release', onClick: () => undefined },
      { type: 'separator' },
      {
        id: 'delete',
        label: 'Delete',
        destructive: true,
        disabled: true,
        onClick: () => undefined,
      },
    ],
    children: (
      <div data-testid='context-row' className={ROW_CLASS}>
        Right-click this row
      </div>
    ),
  },
  play: openMenu,
};

export const LongActionLabels: Story = {
  args: {
    items: [
      {
        id: 'copy',
        label: 'Copy Smart Link For The Extended Anniversary Remaster',
        icon: <Copy className='h-3.5 w-3.5' />,
        subText: 'Includes every featured artist credit',
        onClick: () => undefined,
      },
      {
        id: 'visibility',
        label: 'Visibility On Your Public Artist Profile',
        icon: <Eye className='h-3.5 w-3.5' />,
        items: [
          {
            id: 'shown',
            label: 'Shown On Profile And In Every Smart Link',
            onClick: () => undefined,
          },
        ],
      },
    ],
    children: (
      <div data-testid='context-row' className={ROW_CLASS}>
        Right-click this row
      </div>
    ),
  },
  play: openMenu,
};

export const RtlActions: Story = {
  args: {
    items: [
      {
        id: 'copy',
        label: 'نسخ الرابط',
        icon: <Copy className='h-3.5 w-3.5' />,
        onClick: () => undefined,
      },
      {
        id: 'visibility',
        label: 'الظهور',
        icon: <Eye className='h-3.5 w-3.5' />,
        items: [
          { id: 'shown', label: 'ظاهر في الملف', onClick: () => undefined },
        ],
      },
    ],
    children: (
      <div data-testid='context-row' className={ROW_CLASS}>
        انقر بزر الفأرة الأيمن على هذا الصف
      </div>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: openMenu,
};
