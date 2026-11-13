import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FolderInput, Pencil, Share2 } from 'lucide-react';
import { useState } from 'react';

import { DROPDOWN_CONTENT_BASE, MENU_ITEM_BASE } from '../lib/dropdown-styles';
import { cn } from '../lib/utils';
import {
  type MenuRenderContext,
  renderItem,
  renderRootBody,
  SearchableContent,
} from './common-dropdown-renderer';
import type { CommonDropdownItem } from './common-dropdown-types';
import { filterItems } from './common-dropdown-utils';

const meta = {
  title: 'UI/Atoms/CommonDropdown/Search',
  component: SearchableContent,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['isLoading'] },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SearchableContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [query, setQuery] = useState('');
    return (
      <div className='w-64 rounded-(--system-b-radius-overlay) border border-default bg-surface-elevated p-1 shadow-popover'>
        <SearchableContent
          query={query}
          placeholder='Search actions'
          onQueryChange={setQuery}
          onClear={() => setQuery('')}
        />
      </div>
    );
  },
};

const menuContext: MenuRenderContext = {
  kind: 'dropdown',
  itemBase: MENU_ITEM_BASE,
  disablePortal: false,
};

const releaseActions: readonly CommonDropdownItem[] = [
  {
    id: 'edit',
    type: 'action',
    label: 'Edit release',
    icon: Pencil,
    onClick: () => undefined,
  },
  {
    id: 'share',
    type: 'action',
    label: 'Share release',
    icon: Share2,
    onClick: () => undefined,
  },
  {
    id: 'move',
    type: 'submenu',
    label: 'Move to',
    icon: FolderInput,
    items: [
      { id: 'drafts', type: 'action', label: 'Drafts', onClick: () => {} },
      { id: 'archive', type: 'action', label: 'Archive', onClick: () => {} },
    ],
  },
  { id: 'copy', type: 'action', label: 'Copy link', onClick: () => undefined },
];

/**
 * An open menu drawn with the renderer: the search header, then the root body
 * (loading, empty or the rendered rows) exactly as CommonDropdown composes it.
 */
function RendererMenu({
  label,
  initialQuery = '',
  items = releaseActions,
  isLoading = false,
  dir,
}: {
  readonly label: string;
  readonly initialQuery?: string;
  readonly items?: readonly CommonDropdownItem[];
  readonly isLoading?: boolean;
  readonly dir?: 'ltr' | 'rtl';
}) {
  const [query, setQuery] = useState(initialQuery);
  return (
    <div dir={dir}>
      <DropdownMenuPrimitive.Root open modal={false} dir={dir}>
        <DropdownMenuPrimitive.Trigger className='text-sm text-secondary-token'>
          {label}
        </DropdownMenuPrimitive.Trigger>
        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            aria-label={label}
            /* A text input is not an allowed child of role="menu" (axe
               aria-required-children): the searchable surface presents as a
               group and the item rows keep an inner menu, mirroring
               CommonDropdown's composition. Radix hardcodes aria-orientation
               on the content; orientation is not an allowed aria-* attribute
               on role="group" (axe aria-allowed-attr), so strip it here just
               like CommonDropdown does. */
            role='group'
            aria-orientation={undefined}
            className={cn(DROPDOWN_CONTENT_BASE, 'w-64')}
          >
            <SearchableContent
              query={query}
              placeholder='Search actions'
              onQueryChange={setQuery}
              onClear={() => setQuery('')}
            />
            <div role='menu'>
              {renderRootBody({
                isLoading,
                items: filterItems(items, query, 'recursive'),
                emptyMessage: 'No actions found',
                renderItems: rows =>
                  rows.map(row => renderItem(row, menuContext)),
              })}
            </div>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>
    </div>
  );
}

/** While the owner loads items, the body is one inert row with a polite status. */
export const LoadingItems: Story = {
  render: () => <RendererMenu label='Release actions' isLoading />,
};

/** A query that matches nothing keeps the field and shows the empty row. */
export const EmptyResults: Story = {
  render: () => <RendererMenu label='Release actions' initialQuery='Tour' />,
};

/** A query that matches some rows keeps only those, submenus included. */
export const PartialMatches: Story = {
  render: () => <RendererMenu label='Release actions' initialQuery='re' />,
};

/** Long labels truncate inside the row instead of widening the menu. */
export const LongContentLabels: Story = {
  render: () => (
    <RendererMenu
      label='Release actions'
      items={[
        {
          id: 'edit-long',
          type: 'action',
          label:
            'Edit the release title, artwork, credits and every linked platform',
          icon: Pencil,
          onClick: () => undefined,
        },
        {
          id: 'move-long',
          type: 'submenu',
          label: 'Move this release to another collection in your catalog',
          icon: FolderInput,
          items: [
            {
              id: 'drafts',
              type: 'action',
              label: 'Drafts',
              onClick: () => {},
            },
          ],
        },
      ]}
    />
  ),
};

/** Right to left: the search icon and the submenu chevron mirror. */
export const RtlMenu: Story = {
  render: () => <RendererMenu label='Release actions' dir='rtl' />,
};
