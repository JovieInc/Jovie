import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Copy, Pencil } from 'lucide-react';
import type * as React from 'react';

import { DROPDOWN_CONTENT_BASE, MENU_ITEM_BASE } from '../lib/dropdown-styles';
import { cn } from '../lib/utils';
import {
  CommonDropdownItemLabel,
  renderActionItem,
  renderCheckboxItem,
} from './common-dropdown-item-renderers';
import type { MenuRenderContext } from './common-dropdown-renderer';

const meta = {
  title: 'UI/Atoms/CommonDropdown/ItemLabel',
  component: CommonDropdownItemLabel,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof CommonDropdownItemLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: 'Edit profile' },
};

export const WithDescription: Story = {
  args: {
    label: 'Publish release',
    description: 'Visible to everyone',
  },
};

const menuContext: MenuRenderContext = {
  kind: 'dropdown',
  itemBase: MENU_ITEM_BASE,
  disablePortal: false,
};

function OpenRendererMenu({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <DropdownMenuPrimitive.Root open modal={false}>
      <DropdownMenuPrimitive.Trigger className='text-sm text-secondary-token'>
        {label}
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          aria-label={label}
          className={cn(DROPDOWN_CONTENT_BASE, 'w-64')}
        >
          {children}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

/** Loading rows keep their geometry: a spinner replaces the icon and the row is busy and inert. */
export const LoadingRows: Story = {
  args: { label: 'Publish release' },
  render: () => (
    <OpenRendererMenu label='Release actions'>
      {renderActionItem(
        {
          id: 'publish',
          type: 'action',
          label: 'Publish release',
          loading: true,
          onClick: () => undefined,
        },
        menuContext
      )}
      {renderCheckboxItem(
        {
          id: 'show-drafts',
          type: 'checkbox',
          label: 'Show drafts',
          checked: true,
          loading: true,
          onCheckedChange: () => undefined,
        },
        menuContext
      )}
      {renderActionItem(
        {
          id: 'edit',
          type: 'action',
          label: 'Edit release',
          icon: Pencil,
          onClick: () => undefined,
        },
        menuContext
      )}
    </OpenRendererMenu>
  ),
};

/** Rows with only a label beside rows that carry icon, description and shortcut. */
export const PartialRowFields: Story = {
  args: { label: 'Copy link' },
  render: () => (
    <OpenRendererMenu label='Release actions'>
      {renderActionItem(
        {
          id: 'copy-link',
          type: 'action',
          label: 'Copy link',
          onClick: () => undefined,
        },
        menuContext
      )}
      {renderActionItem(
        {
          id: 'edit',
          type: 'action',
          label: 'Edit release',
          description: 'Artwork and credits',
          icon: Pencil,
          shortcut: '⌘E',
          onClick: () => undefined,
        },
        menuContext
      )}
      {renderCheckboxItem(
        {
          id: 'show-drafts',
          type: 'checkbox',
          label: 'Show drafts',
          checked: false,
          onCheckedChange: () => undefined,
        },
        menuContext
      )}
    </OpenRendererMenu>
  ),
};

/** Long labels truncate and long descriptions wrap without pushing trailing badges out. */
export const LongContent: Story = {
  args: {
    label: 'Copy the smart link to share with playlist curators and press',
    description:
      'Opens on every listener’s preferred platform and remembers their choice next time',
  },
  render: () => (
    <OpenRendererMenu label='Release actions'>
      {renderActionItem(
        {
          id: 'copy-link',
          type: 'action',
          label:
            'Copy the smart link to share with playlist curators and press',
          description:
            'Opens on every listener’s preferred platform and remembers their choice next time',
          icon: Copy,
          badge: { text: 'NEW' },
          onClick: () => undefined,
        },
        menuContext
      )}
      {renderCheckboxItem(
        {
          id: 'show-drafts',
          type: 'checkbox',
          label: 'Show drafts, scheduled releases and unpublished merch',
          checked: true,
          count: 1280,
          onCheckedChange: () => undefined,
        },
        menuContext
      )}
    </OpenRendererMenu>
  ),
};

/** Right-to-left rows mirror the leading slot, check indicator and trailing shortcut. */
export const Rtl: Story = {
  args: { label: 'تعديل الإصدار' },
  render: () => (
    <div dir='rtl'>
      <OpenRendererMenu label='إجراءات الإصدار'>
        {renderActionItem(
          {
            id: 'rtl-edit',
            type: 'action',
            label: 'تعديل تفاصيل الإصدار والغلاف وبيانات المشاركين',
            description: 'يظهر للجميع بعد النشر',
            icon: Pencil,
            shortcut: '⌘E',
            onClick: () => undefined,
          },
          menuContext
        )}
        {renderCheckboxItem(
          {
            id: 'rtl-drafts',
            type: 'checkbox',
            label: 'إظهار المسودات',
            checked: true,
            count: 3,
            onCheckedChange: () => undefined,
          },
          menuContext
        )}
      </OpenRendererMenu>
    </div>
  ),
};
