import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
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

const withRtl: Decorator = function WithRtl(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Features/Dashboard/Contacts/ContactDetailSidebar States',
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

export const LoadingSave: Story = {
  args: { contact: { ...contact, isSaving: true } },
};

export const ErrorSaveFailed: Story = {
  args: {
    contact: {
      ...contact,
      error: 'Could not save this contact. Check the email and try again.',
    },
  },
};

export const PartialCompanyOnly: Story = {
  args: {
    contact: {
      ...contact,
      personName: null,
      phone: null,
      preferredChannel: null,
      territories: [],
    },
  },
};

export const LongContentValues: Story = {
  args: {
    contact: {
      ...contact,
      role: 'other',
      customLabel: 'Sync licensing and international brand partnerships lead',
      personName: 'Alexandria Montgomery-Fitzgerald of Westminster',
      companyName:
        'International Artist Management and Touring Partnerships Limited',
      email:
        'alexandria.montgomery-fitzgerald@international-management.example',
      territories: [
        'North America',
        'UK',
        'Europe (ex-UK)',
        'Latin America',
        'Asia',
        'Australia & New Zealand',
      ],
    },
  },
};

export const RtlDocument: Story = {
  decorators: [withRtl],
  args: {
    contact: {
      ...contact,
      personName: 'كيلي ستريكلاند',
      companyName: 'נורת׳ סטאר',
    },
  },
};
