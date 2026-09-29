import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminPeopleRightPanelProvider } from '@/components/features/admin/AdminPeopleRightPanelProvider';
import type {
  AdminContactRow,
  AdminContactStageMetrics,
} from './AdminContactsTable';
import { AdminContactsTable } from './AdminContactsTable';

const rows: AdminContactRow[] = [
  {
    dedupeKey: 'email:ari@example.com',
    stage: 'paying',
    overrideStage: null,
    displayName: 'Ari Lane',
    email: 'ari@example.com',
    handle: 'ari',
    avatarUrl: null,
    sources: ['profile', 'user', 'waitlist'],
    certifiedAt: '2026-02-01T00:00:00.000Z',
    stageAt: '2026-03-01T00:00:00.000Z',
    activityAt: '2026-03-01T00:00:00.000Z',
    firstSeenAt: '2026-01-10T00:00:00.000Z',
    userId: 'user_1',
    creatorProfileId: 'profile_1',
    leadId: null,
    waitlistEntryId: 'waitlist_1',
  },
  {
    dedupeKey: 'handle:bedford',
    stage: 'suggested',
    overrideStage: null,
    displayName: 'The Bedfords',
    email: null,
    handle: 'bedford',
    avatarUrl: null,
    sources: ['lead'],
    certifiedAt: null,
    stageAt: '2026-04-01T00:00:00.000Z',
    activityAt: '2026-04-01T00:00:00.000Z',
    firstSeenAt: '2026-04-01T00:00:00.000Z',
    userId: null,
    creatorProfileId: null,
    leadId: 'lead_1',
    waitlistEntryId: null,
  },
];

const metrics: AdminContactStageMetrics = {
  total: 2,
  suggested: 1,
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

const meta: Meta<typeof AdminContactsTable> = {
  title: 'Admin/Tables/Contacts',
  component: AdminContactsTable,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <AdminPeopleRightPanelProvider>
        <Story />
      </AdminPeopleRightPanelProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    rows,
    total: rows.length,
    page: 1,
    pageSize: 50,
    stage: null,
    search: '',
    metrics,
  },
};

export const Empty: Story = {
  args: {
    ...Default.args,
    rows: [],
    total: 0,
    metrics: { ...metrics, total: 0, suggested: 0, paying: 0 },
  },
};
