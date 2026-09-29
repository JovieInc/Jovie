import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { PublicContact } from '@/types/contacts';
import { ContactView } from './ContactView';

const contacts: PublicContact[] = [
  {
    id: 'bookings',
    role: 'bookings',
    roleLabel: 'Bookings',
    territorySummary: 'Worldwide',
    territoryCount: 1,
    companyLabel: 'Wasserman Music',
    channels: [{ type: 'email', encoded: 'bookings@example.com' }],
  },
  {
    id: 'management',
    role: 'management',
    roleLabel: 'Management',
    territorySummary: 'Worldwide',
    territoryCount: 1,
    companyLabel: 'Silver Arrow Management',
    channels: [{ type: 'email', encoded: 'management@example.com' }],
  },
];

const meta = {
  title: 'Features/Profile/ContactView',
  component: ContactView,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    artistHandle: 'tim',
    contacts,
  },
} satisfies Meta<typeof ContactView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
