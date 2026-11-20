import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import type { EditableContact } from '@/features/dashboard/hooks/useContactsManager';
import { ContactsTable } from './ContactsTable';

const baseContact: EditableContact = {
  id: 'contact-1',
  creatorProfileId: 'profile-1',
  role: 'management',
  customLabel: null,
  personName: 'Kelly Strickland',
  companyName: 'North Star Management',
  territories: ['North America'],
  email: 'kelly@northstar.example',
  phone: '+1 555 0100',
  preferredChannel: 'email',
  isActive: true,
  sortOrder: 0,
};

const withContactsProviders: Decorator = function WithContactsProviders(Story) {
  return (
    <HeaderActionsProvider>
      <RightPanelProvider>
        <TableMetaProvider>
          <div className='h-96 bg-(--app-shell-content-surface)'>
            <Story />
          </div>
        </TableMetaProvider>
      </RightPanelProvider>
    </HeaderActionsProvider>
  );
};

const withRtl: Decorator = function WithRtl(Story) {
  return (
    <div dir='rtl' className='h-full'>
      <Story />
    </div>
  );
};

const meta: Meta<typeof ContactsTable> = {
  title: 'Dashboard/Contacts/ContactsTable States',
  component: ContactsTable,
  decorators: [withContactsProviders],
  args: {
    artistName: 'Tim White',
    contacts: [baseContact],
    onUpdate: fn(),
    onSave: fn(async (contact: EditableContact) => contact.id),
    onDelete: fn(),
    onAddContact: fn(),
  },
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const PartialDetails: Story = {
  args: {
    contacts: [
      {
        ...baseContact,
        companyName: null,
        territories: [],
        phone: null,
        preferredChannel: null,
      },
      {
        ...baseContact,
        id: 'contact-2',
        role: 'bookings',
        personName: null,
        companyName: 'Wavelength Agency',
        email: null,
        phone: '+44 20 7946 0000',
        sortOrder: 1,
      },
    ],
  },
};

export const LongContentNames: Story = {
  args: {
    contacts: [
      {
        ...baseContact,
        personName:
          'Alexandria Montgomery-Fitzgerald of Westminster and Kensington',
        companyName:
          'International Artist Management and Touring Partnerships Limited',
        email:
          'alexandria.montgomery-fitzgerald@international-management.example',
      },
      ...Array.from({ length: 12 }, (_, index) => ({
        ...baseContact,
        id: `contact-${index + 2}`,
        personName: `Contact ${index + 2}`,
        sortOrder: index + 1,
      })),
    ],
  },
};

export const RtlDocument: Story = {
  decorators: [withRtl],
  args: {
    contacts: [
      {
        ...baseContact,
        personName: 'كيلي ستريكلاند',
        companyName: 'نجم الشمال',
      },
      {
        ...baseContact,
        id: 'contact-2',
        role: 'press_pr',
        personName: 'יעל כהן',
        companyName: 'Press House',
        sortOrder: 1,
      },
    ],
  },
};
