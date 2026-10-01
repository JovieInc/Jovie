import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { PublicContact } from '@/types/contacts';
import { ContactDrawer } from './ContactDrawer';

const contacts: PublicContact[] = [
  {
    id: 'bookings',
    role: 'bookings',
    roleLabel: 'Bookings',
    territorySummary: 'Worldwide',
    territoryCount: 1,
    companyLabel: 'Wasserman Music',
    contactName: 'Jordan Lee',
    channels: [{ type: 'email', encoded: 'bookings@example.com' }],
  },
  {
    id: 'press',
    role: 'press_pr',
    roleLabel: 'Press',
    territorySummary: 'US & Canada',
    territoryCount: 2,
    companyLabel: 'Shore Fire Media',
    channels: [{ type: 'email', encoded: 'press@example.com' }],
  },
];

const meta = {
  title: 'Features/Profile/ContactDrawer',
  component: ContactDrawer,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    open: true,
    onOpenChange: () => {},
    artistName: 'Tim White',
    artistHandle: 'tim',
    contacts,
    primaryChannel: (contact: PublicContact) => contact.channels[0],
  },
} satisfies Meta<typeof ContactDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
