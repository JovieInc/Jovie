import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { CommonDropdown } from './common-dropdown';

const meta: Meta<typeof CommonDropdown> = {
  title: 'UI/Atoms/CommonDropdown States',
  component: CommonDropdown,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof CommonDropdown>;

/**
 * Simple action menu with edit and delete options
 */

function OpenCommonDropdown(props: Parameters<typeof CommonDropdown>[0]) {
  const [open, setOpen] = useState(true);
  return (
    <CommonDropdown
      {...props}
      open={open}
      onOpenChange={setOpen}
      modal={false}
    />
  );
}

/**
 * Long labels and descriptions in a capped-width menu
 */
export const LongContent: Story = {
  render: () => (
    <OpenCommonDropdown
      aria-label='Release actions'
      contentClassName='w-64'
      items={[
        {
          type: 'label',
          id: 'release-label',
          label: 'Actions for the summer single and its extended club mix',
        },
        {
          type: 'action',
          id: 'copy-link',
          label: 'Copy the smart link to share with playlist curators',
          description:
            'Opens on every listener’s preferred platform and remembers it',
          icon: Copy,
          onClick: () => undefined,
        },
        {
          type: 'action',
          id: 'edit-release',
          label: 'Edit release details, artwork, credits and territories',
          icon: Pencil,
          shortcut: '⌘E',
          onClick: () => undefined,
        },
        { type: 'separator', id: 'sep-long' },
        {
          type: 'action',
          id: 'remove-release',
          label: 'Remove this release from the public profile permanently',
          icon: Trash2,
          variant: 'destructive',
          onClick: () => undefined,
        },
      ]}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Long labels and descriptions truncate with an ellipsis inside a capped-width menu, keeping icons and shortcuts aligned.',
      },
    },
  },
};

/**
 * Right-to-left labels
 */
export const Rtl: Story = {
  render: () => (
    <div dir='rtl'>
      <OpenCommonDropdown
        aria-label='إجراءات الإصدار'
        contentClassName='w-64'
        items={[
          {
            type: 'label',
            id: 'rtl-label',
            label: 'إجراءات الإصدار',
          },
          {
            type: 'action',
            id: 'rtl-edit',
            label: 'تعديل تفاصيل الإصدار والغلاف وبيانات المشاركين',
            icon: Pencil,
            onClick: () => undefined,
          },
          {
            type: 'action',
            id: 'rtl-copy',
            label: 'نسخ الرابط الذكي لمشاركته مع الجمهور وقوائم التشغيل',
            icon: Copy,
            onClick: () => undefined,
          },
          { type: 'separator', id: 'rtl-sep' },
          {
            type: 'action',
            id: 'rtl-delete',
            label: 'حذف الإصدار',
            icon: Trash2,
            variant: 'destructive',
            onClick: () => undefined,
          },
        ]}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Arabic labels on a right-to-left page: the trigger follows the page direction and long labels truncate inside the menu width instead of overflowing it.',
      },
    },
  },
};
