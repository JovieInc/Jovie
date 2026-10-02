import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ContextMenuItemType } from '@/components/organisms/table';
import type { EditableContact } from '@/features/dashboard/hooks/useContactsManager';
import { buildContactActions } from './contact-actions';

/**
 * buildContactActions is a pure builder with no rendered output of its own;
 * it's shared by the ellipsis menu and the row right-click context menu.
 * This story documents its output shape.
 */
function MenuItemsPreview({
  items,
}: {
  readonly items: ContextMenuItemType[];
}) {
  return (
    <ul className='w-56 rounded-lg border border-subtle bg-surface-1 p-1 text-app'>
      {items.map((item, index) =>
        'type' in item ? (
          <li key={`separator-${index}`} className='my-1 h-px bg-subtle' />
        ) : (
          <li
            key={item.id}
            className={
              'destructive' in item && item.destructive
                ? 'text-destructive'
                : 'text-secondary-token'
            }
          >
            {item.label}
          </li>
        )
      )}
    </ul>
  );
}

const contact: EditableContact = {
  id: 'contact-1',
  creatorProfileId: 'profile-1',
  role: 'management',
  customLabel: null,
  personName: 'Jamie Rivera',
  companyName: null,
  territories: [],
  email: 'jamie@example.com',
  phone: '+1 555-0100',
  preferredChannel: 'email',
  isActive: true,
  sortOrder: 0,
};

const meta = {
  title: 'Dashboard/Organisms/ContactsTable/contact-actions',
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof MenuItemsPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithEmailAndPhone: Story = {
  render: () => (
    <MenuItemsPreview
      items={buildContactActions(contact, { onDelete: () => {} })}
    />
  ),
};

export const NoContactMethods: Story = {
  render: () => (
    <MenuItemsPreview
      items={buildContactActions(
        { ...contact, email: null, phone: null },
        { onDelete: () => {} }
      )}
    />
  ),
};
