import type { Meta, StoryObj } from '@storybook/react';
import {
  Copy,
  LayoutGrid,
  LayoutList,
  Pencil,
  Search,
  Settings2,
  Trash2,
  User,
} from 'lucide-react';
import { useState } from 'react';

import { CommonDropdown } from './common-dropdown';

const meta: Meta<typeof CommonDropdown> = {
  title: 'Atoms/CommonDropdown',
  component: CommonDropdown,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CommonDropdown>;

/**
 * Simple action menu with edit and delete options
 */
export const SimpleActionMenu: Story = {
  args: {
    variant: 'dropdown',
    items: [
      {
        type: 'action',
        id: 'edit',
        label: 'Edit',
        icon: Pencil,
        onClick: () => console.log('Edit clicked'),
      },
      {
        type: 'action',
        id: 'duplicate',
        label: 'Duplicate',
        icon: Copy,
        onClick: () => console.log('Duplicate clicked'),
      },
      { type: 'separator', id: 'sep-1' },
      {
        type: 'action',
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        onClick: () => console.log('Delete clicked'),
        variant: 'destructive',
      },
    ],
  },
};

/**
 * Action menu with badges, subtext, and shortcuts
 */
export const AdvancedActionMenu: Story = {
  args: {
    variant: 'dropdown',
    items: [
      {
        type: 'action',
        id: 'edit',
        label: 'Edit',
        icon: Pencil,
        onClick: () => console.log('Edit clicked'),
        shortcut: '⌘E',
      },
      {
        type: 'action',
        id: 'copy',
        label: 'Copy ID',
        icon: Copy,
        onClick: () => console.log('Copy clicked'),
        subText: 'usr_123',
        badge: { text: 'NEW', color: '#7c3aed' },
      },
      { type: 'separator', id: 'sep-1' },
      {
        type: 'action',
        id: 'delete',
        label: 'Delete permanently',
        icon: Trash2,
        onClick: () => console.log('Delete clicked'),
        variant: 'destructive',
        shortcut: '⌘⌫',
      },
    ],
  },
};

/**
 * Dropdown with checkbox items for column visibility
 */
export const WithCheckboxes: Story = {
  render: () => {
    const [visibility, setVisibility] = useState({
      email: true,
      phone: false,
      address: true,
      notes: false,
    });

    return (
      <CommonDropdown
        variant='dropdown'
        trigger={
          <button
            type='button'
            className='inline-flex items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 py-1.5 text-sm text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token'
          >
            <Settings2 className='h-4 w-4' />
            Columns
          </button>
        }
        items={[
          { type: 'label', id: 'label-1', label: 'Show columns' },
          {
            type: 'checkbox',
            id: 'email',
            label: 'Email',
            checked: visibility.email,
            onCheckedChange: checked =>
              setVisibility({ ...visibility, email: checked }),
          },
          {
            type: 'checkbox',
            id: 'phone',
            label: 'Phone',
            checked: visibility.phone,
            onCheckedChange: checked =>
              setVisibility({ ...visibility, phone: checked }),
          },
          {
            type: 'checkbox',
            id: 'address',
            label: 'Address',
            checked: visibility.address,
            onCheckedChange: checked =>
              setVisibility({ ...visibility, address: checked }),
          },
          {
            type: 'checkbox',
            id: 'notes',
            label: 'Notes',
            checked: visibility.notes,
            onCheckedChange: checked =>
              setVisibility({ ...visibility, notes: checked }),
          },
        ]}
      />
    );
  },
};

/**
 * Dropdown with radio group for view mode selection
 */
export const WithRadioGroup: Story = {
  render: () => {
    const [viewMode, setViewMode] = useState('list');

    return (
      <CommonDropdown
        variant='dropdown'
        trigger={
          <button
            type='button'
            className='inline-flex items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 py-1.5 text-sm text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token'
          >
            <Settings2 className='h-4 w-4' />
            View: {viewMode}
          </button>
        }
        items={[
          { type: 'label', id: 'label-1', label: 'View mode' },
          {
            type: 'radio',
            id: 'view-mode',
            value: viewMode,
            onValueChange: setViewMode,
            items: [
              { id: 'list', value: 'list', label: 'List', icon: LayoutList },
              { id: 'board', value: 'board', label: 'Board', icon: LayoutGrid },
            ],
          },
        ]}
      />
    );
  },
};

/**
 * Complex dropdown with mixed item types (like DisplayMenuDropdown)
 */
export const ComplexDisplayMenu: Story = {
  render: () => {
    const [viewMode, setViewMode] = useState('list');
    const [visibility, setVisibility] = useState({
      email: true,
      phone: false,
      address: true,
    });

    return (
      <CommonDropdown
        variant='dropdown'
        trigger={
          <button
            type='button'
            className='inline-flex items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 py-1.5 text-sm text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token'
          >
            <Settings2 className='h-4 w-4' />
            Display
          </button>
        }
        contentClassName='w-56'
        items={[
          { type: 'label', id: 'view-label', label: 'View mode' },
          {
            type: 'radio',
            id: 'view-mode',
            value: viewMode,
            onValueChange: setViewMode,
            items: [
              { id: 'list', value: 'list', label: 'List', icon: LayoutList },
              { id: 'board', value: 'board', label: 'Board', icon: LayoutGrid },
            ],
          },
          { type: 'separator', id: 'sep-1' },
          { type: 'label', id: 'columns-label', label: 'Show columns' },
          {
            type: 'checkbox',
            id: 'email',
            label: 'Email',
            checked: visibility.email,
            onCheckedChange: checked =>
              setVisibility({ ...visibility, email: checked }),
          },
          {
            type: 'checkbox',
            id: 'phone',
            label: 'Phone',
            checked: visibility.phone,
            onCheckedChange: checked =>
              setVisibility({ ...visibility, phone: checked }),
          },
          {
            type: 'checkbox',
            id: 'address',
            label: 'Address',
            checked: visibility.address,
            onCheckedChange: checked =>
              setVisibility({ ...visibility, address: checked }),
          },
        ]}
      />
    );
  },
};

/**
 * Dropdown with nested submenus
 */
export const WithSubmenus: Story = {
  args: {
    variant: 'dropdown',
    items: [
      {
        type: 'action',
        id: 'edit',
        label: 'Edit',
        icon: Pencil,
        onClick: () => console.log('Edit clicked'),
      },
      {
        type: 'submenu',
        id: 'copy',
        label: 'Copy',
        icon: Copy,
        items: [
          {
            type: 'action',
            id: 'copy-id',
            label: 'Copy ID',
            onClick: () => console.log('Copy ID'),
          },
          {
            type: 'action',
            id: 'copy-name',
            label: 'Copy Name',
            onClick: () => console.log('Copy Name'),
          },
          {
            type: 'action',
            id: 'copy-email',
            label: 'Copy Email',
            onClick: () => console.log('Copy Email'),
          },
        ],
      },
      { type: 'separator', id: 'sep-1' },
      {
        type: 'action',
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        onClick: () => console.log('Delete clicked'),
        variant: 'destructive',
      },
    ],
  },
};

/**
 * Context menu (right-click) variant
 */
export const ContextMenuVariant: Story = {
  render: () => (
    <CommonDropdown
      variant='context'
      items={[
        {
          type: 'action',
          id: 'edit',
          label: 'Edit',
          icon: Pencil,
          onClick: () => console.log('Edit clicked'),
        },
        {
          type: 'action',
          id: 'duplicate',
          label: 'Duplicate',
          icon: Copy,
          onClick: () => console.log('Duplicate clicked'),
        },
        { type: 'separator', id: 'sep-1' },
        {
          type: 'action',
          id: 'delete',
          label: 'Delete',
          icon: Trash2,
          onClick: () => console.log('Delete clicked'),
          variant: 'destructive',
        },
      ]}
    >
      <div className='flex h-32 w-64 items-center justify-center rounded-lg border-2 border-dashed border-subtle bg-surface-1 text-sm text-secondary-token'>
        Right-click me
      </div>
    </CommonDropdown>
  ),
};

/**
 * Searchable dropdown for filtering long lists
 */
export const SearchableDropdown: Story = {
  args: {
    variant: 'dropdown',
    searchable: true,
    searchPlaceholder: 'Search actions...',
    items: [
      {
        type: 'action',
        id: '1',
        label: 'Apple',
        onClick: () => console.log('Apple'),
      },
      {
        type: 'action',
        id: '2',
        label: 'Banana',
        onClick: () => console.log('Banana'),
      },
      {
        type: 'action',
        id: '3',
        label: 'Cherry',
        onClick: () => console.log('Cherry'),
      },
      {
        type: 'action',
        id: '4',
        label: 'Date',
        onClick: () => console.log('Date'),
      },
      {
        type: 'action',
        id: '5',
        label: 'Elderberry',
        onClick: () => console.log('Elderberry'),
      },
      {
        type: 'action',
        id: '6',
        label: 'Fig',
        onClick: () => console.log('Fig'),
      },
      {
        type: 'action',
        id: '7',
        label: 'Grape',
        onClick: () => console.log('Grape'),
      },
    ],
  },
};

/**
 * Loading state
 */
export const LoadingState: Story = {
  args: {
    variant: 'dropdown',
    isLoading: true,
    items: [],
  },
};

/**
 * Empty state with custom message
 */
export const EmptyState: Story = {
  args: {
    variant: 'dropdown',
    emptyMessage: 'No actions available',
    items: [],
  },
};

/**
 * Custom trigger button
 */
export const CustomTrigger: Story = {
  args: {
    variant: 'dropdown',
    trigger: (
      <button
        type='button'
        className='inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover'
      >
        <User className='h-4 w-4' />
        Actions
      </button>
    ),
    items: [
      {
        type: 'action',
        id: 'edit',
        label: 'Edit Profile',
        icon: Pencil,
        onClick: () => console.log('Edit clicked'),
      },
      {
        type: 'action',
        id: 'settings',
        label: 'Settings',
        icon: Settings2,
        onClick: () => console.log('Settings clicked'),
      },
      { type: 'separator', id: 'sep-1' },
      {
        type: 'action',
        id: 'delete',
        label: 'Delete Account',
        icon: Trash2,
        onClick: () => console.log('Delete clicked'),
        variant: 'destructive',
      },
    ],
  },
};

/**
 * Disabled dropdown
 */
export const DisabledDropdown: Story = {
  args: {
    variant: 'dropdown',
    disabled: true,
    items: [
      {
        type: 'action',
        id: 'edit',
        label: 'Edit',
        icon: Pencil,
        onClick: () => console.log('Edit clicked'),
      },
    ],
  },
};

/**
 * Dropdown with custom icon as ReactNode (for colored badges)
 */
export const WithCustomIconRendering: Story = {
  args: {
    variant: 'dropdown',
    items: [
      {
        type: 'action',
        id: 'spotify',
        label: 'Spotify',
        icon: (
          <div
            className='flex h-5 w-5 items-center justify-center rounded'
            style={{ backgroundColor: '#1DB954', color: '#fff' }}
          >
            <Search className='h-3 w-3' />
          </div>
        ),
        onClick: () => console.log('Spotify clicked'),
      },
      {
        type: 'action',
        id: 'apple',
        label: 'Apple Music',
        icon: (
          <div
            className='flex h-5 w-5 items-center justify-center rounded'
            style={{ backgroundColor: '#FA243C', color: '#fff' }}
          >
            <Search className='h-3 w-3' />
          </div>
        ),
        onClick: () => console.log('Apple Music clicked'),
      },
    ],
  },
};
