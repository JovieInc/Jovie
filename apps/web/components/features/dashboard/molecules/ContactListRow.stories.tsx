import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { EditableContact } from '@/types/contacts';
import { ContactListRow } from './ContactListRow';

const contact: EditableContact = {
  id: 'contact-1',
  creatorProfileId: 'profile-1',
  role: 'management',
  customLabel: null,
  personName: 'Jordan Reyes',
  companyName: 'North Star Management',
  territories: ['US', 'CA'],
  email: 'jordan@northstar.example',
  phone: null,
  preferredChannel: 'email',
  isActive: true,
  sortOrder: 0,
};

/**
 * ContactListRow is one selectable row in the contacts list. Each story
 * changes only the contact record, the selection or the document direction.
 */
const meta = {
  title: 'Dashboard/Molecules/ContactListRow',
  component: ContactListRow,
  parameters: {
    layout: 'centered',
  },
  args: {
    contact,
    isSelected: false,
    onClick: fn(),
  },
  render: args => (
    <div className='w-80'>
      <ContactListRow {...args} />
    </div>
  ),
} satisfies Meta<typeof ContactListRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = {
  args: { isSelected: true },
};

/** Partial: a role with no person, email or territory (shows General). */
export const PartialRoleOnly: Story = {
  args: {
    contact: {
      ...contact,
      role: 'press',
      personName: null,
      email: null,
      territories: [],
    },
  },
};

/** Long content: a long custom label, name, email and many territories truncate. */
export const LongContentDetails: Story = {
  args: {
    contact: {
      ...contact,
      role: 'other',
      customLabel:
        'European festival booking and routing partner for spring and summer',
      personName: 'Maximiliana Alessandra Konstantinopoulou-Vanderberg',
      email: 'maximiliana.konstantinopoulou@festival-routing-partners.example',
      territories: ['DE', 'FR', 'NL', 'BE', 'ES', 'IT', 'PT'],
    },
  },
};

/** Right-to-left: an Arabic contact inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    contact: {
      ...contact,
      role: 'other',
      customLabel: 'وكيل الحجوزات',
      personName: 'ليلى حداد',
    },
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
