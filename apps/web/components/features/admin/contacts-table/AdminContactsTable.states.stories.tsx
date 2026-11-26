import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminPeopleRightPanelProvider } from '@/components/features/admin/AdminPeopleRightPanelProvider';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import type {
  AdminContactRow,
  AdminContactStageMetrics,
} from './AdminContactsTable';
import { AdminContactsTable } from './AdminContactsTable';

const baseRow: AdminContactRow = {
  dedupeKey: 'email:ari@example.com',
  stage: 'paying',
  overrideStage: null,
  displayName: 'Ari Lane',
  email: 'ari@example.com',
  handle: 'ari',
  avatarUrl: null,
  sources: ['profile', 'user'],
  certifiedAt: '2026-02-01T00:00:00.000Z',
  stageAt: '2026-03-01T00:00:00.000Z',
  activityAt: '2026-03-01T00:00:00.000Z',
  firstSeenAt: '2026-01-10T00:00:00.000Z',
  userId: 'user_1',
  creatorProfileId: 'profile_1',
  leadId: null,
  waitlistEntryId: null,
};

const metrics: AdminContactStageMetrics = {
  total: 1,
  suggested: 0,
  approved: 0,
  outreach: 0,
  profile_created: 0,
  certified: 0,
  signed_up: 0,
  claimed: 0,
  activated: 0,
  paying: 1,
  churned: 0,
};

const meta = {
  title: 'Admin/Tables/Contacts/States',
  component: AdminContactsTable,
  parameters: { layout: 'fullscreen' },
  args: {
    rows: [baseRow],
    total: 1,
    page: 1,
    pageSize: 50,
    stage: null,
    search: '',
    metrics,
  },
  decorators: [
    function ContactsStatesFrame(Story) {
      return (
        <RightPanelProvider>
          <AdminPeopleRightPanelProvider>
            <Story />
          </AdminPeopleRightPanelProvider>
        </RightPanelProvider>
      );
    },
  ],
} satisfies Meta<typeof AdminContactsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a lead with no email, no handle and no certification yet. */
export const PartialLeadOnly: Story = {
  args: {
    rows: [
      {
        ...baseRow,
        dedupeKey: 'lead:1',
        stage: 'suggested',
        displayName: null,
        email: null,
        handle: null,
        sources: ['lead'],
        certifiedAt: null,
        userId: null,
        creatorProfileId: null,
        leadId: 'lead_1',
      },
    ],
  },
};

/** Long content: a long name and email stay inside their cells. */
export const LongContentIdentity: Story = {
  args: {
    rows: [
      {
        ...baseRow,
        displayName:
          'Alexandria Montgomery-Featherstonehaugh the Third of Westminster',
        email:
          'alexandria.montgomery.featherstonehaugh.the.third@extremely-long-domain-name-for-testing.example.com',
      },
    ],
  },
};

/** Right-to-left: Arabic name in an RTL admin page. */
export const RtlArabicName: Story = {
  args: { rows: [{ ...baseRow, displayName: 'آري لين' }] },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
