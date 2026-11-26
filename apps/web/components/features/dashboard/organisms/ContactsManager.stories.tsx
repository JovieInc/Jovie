import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  DASHBOARD_FIXTURE_PROFILE_ID,
  DashboardStoryProviders,
} from '@/.storybook/dashboard-fixtures';
import type { DashboardContact } from '@/types/contacts';
import { ContactsManager } from './ContactsManager';

const contact: DashboardContact = {
  id: 'contact-1',
  creatorProfileId: DASHBOARD_FIXTURE_PROFILE_ID,
  role: 'management',
  customLabel: null,
  personName: 'Kelly Strickland',
  companyName: 'North Star Management',
  territories: [],
  email: 'kelly@example.com',
  phone: null,
  preferredChannel: 'email',
  isActive: true,
  sortOrder: 0,
};

const meta = {
  title: 'Dashboard/Organisms/ContactsManager',
  component: ContactsManager,
  parameters: { layout: 'fullscreen' },
  decorators: [
    function ContactsManagerProviders(Story) {
      return (
        <DashboardStoryProviders>
          <div className='min-h-96 bg-surface-0 p-6 text-primary-token'>
            <Story />
          </div>
        </DashboardStoryProviders>
      );
    },
  ],
  args: {
    profileId: DASHBOARD_FIXTURE_PROFILE_ID,
    artistName: 'Sasha Waves',
    artistHandle: 'sashawaves',
    initialContacts: [contact],
  },
} satisfies Meta<typeof ContactsManager>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LoadingContacts: Story = {
  args: { isLoading: true, initialContacts: [] },
};
