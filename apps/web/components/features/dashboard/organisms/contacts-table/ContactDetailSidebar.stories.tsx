import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { EditableContact } from '@/features/dashboard/hooks/useContactsManager';
import { ContactDetailSidebar } from './ContactDetailSidebar';

const contact: EditableContact = {
  id: 'contact-1',
  creatorProfileId: 'profile-1',
  role: 'management',
  customLabel: null,
  personName: 'Alex Rivera',
  companyName: 'North Star',
  territories: ['North America'],
  email: 'alex@example.com',
  phone: '+1 555-0101',
  preferredChannel: 'email',
  isActive: true,
  sortOrder: 0,
  isSaving: false,
  isDeleting: false,
  error: null,
  isExpanded: true,
  customTerritory: '',
  isNew: false,
};

const meta = {
  title: 'Features/Dashboard/Contacts/ContactDetailSidebar',
  component: ContactDetailSidebar,
  args: {
    contact,
    isOpen: true,
    onClose: fn(),
    onUpdate: fn(),
    onSave: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof ContactDetailSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Selected: Story = {};

export const Empty: Story = {
  args: {
    contact: null,
  },
};
