import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import type { PublicContact } from '@/types/contacts';
import { ProfileContactDrawerContent } from './ProfileContactDrawerContent';

/**
 * Rendered states of the profile contact drawer body. The default stories
 * live in ProfileContactDrawerContent.stories.tsx.
 */
const DrawerFrame: Decorator = function DrawerFrame(Story) {
  return (
    <div className='w-full max-w-md bg-base p-4'>
      <Story />
    </div>
  );
};

const RtlDrawerFrame: Decorator = function RtlDrawerFrame(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

function firstChannel(contact: PublicContact) {
  return contact.channels[0];
}

const meta = {
  title: 'Features/Profile/ProfileContactDrawerContent/States',
  component: ProfileContactDrawerContent,
  parameters: { layout: 'fullscreen' },
  args: {
    artistHandle: 'tim',
    contacts: [],
    primaryChannel: firstChannel,
  },
  decorators: [DrawerFrame],
} satisfies Meta<typeof ProfileContactDrawerContent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the profile has no public contacts, so the list renders no rows. */
export const EmptyNoContacts: Story = {};

/** Long content: long role, company and territory names on one contact. */
export const LongContentRoleAndTerritories: Story = {
  args: {
    contacts: [
      {
        id: 'bookings-long',
        role: 'bookings',
        roleLabel: 'Worldwide Festival And Club Bookings',
        territorySummary: 'North America, Europe and Asia Pacific',
        territoryCount: 5,
        territories: [
          'United States of America',
          'Canada',
          'United Kingdom of Great Britain',
          'Germany',
          'Japan',
        ],
        companyLabel: 'Independent Artist Representation Collective',
        contactName: 'Jordan Alexander Lee-Montgomery',
        channels: [
          { type: 'email', encoded: 'bookings@example.com' },
          { type: 'phone', encoded: '+15555550100' },
        ],
      },
    ],
  },
};

/** Right-to-left: an Arabic contact in an Arabic document direction. */
export const RtlArabicContact: Story = {
  args: {
    contacts: [
      {
        id: 'press-ar',
        role: 'press_pr',
        roleLabel: 'الصحافة',
        territorySummary: 'الشرق الأوسط',
        territoryCount: 2,
        territories: ['الإمارات', 'مصر'],
        companyLabel: 'وكالة الإعلام',
        channels: [{ type: 'email', encoded: 'press@example.com' }],
      },
    ],
  },
  decorators: [RtlDrawerFrame],
};
