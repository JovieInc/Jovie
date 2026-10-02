import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import { AdminWaitlistTableWithViews } from './AdminWaitlistTableWithViews';

const entries: WaitlistEntryRow[] = [
  {
    id: 'waitlist_1',
    fullName: 'Ari Lane',
    email: 'ari@example.com',
    primaryGoal: null,
    primarySocialUrl: 'https://instagram.com/ari',
    primarySocialPlatform: 'instagram',
    primarySocialUrlNormalized: 'https://instagram.com/ari',
    spotifyUrl: null,
    spotifyUrlNormalized: null,
    spotifyArtistName: null,
    heardAbout: null,
    status: 'new',
    primarySocialFollowerCount: null,
    createdAt: new Date('2026-01-10T00:00:00.000Z'),
    updatedAt: new Date('2026-01-10T00:00:00.000Z'),
  } as WaitlistEntryRow,
];

const meta: Meta<typeof AdminWaitlistTableWithViews> = {
  title: 'Admin/Tables/WaitlistWithViews',
  component: AdminWaitlistTableWithViews,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof meta>;
export const IntegrityAndSelection: Story = {
  args: {
    entries,
    page: 1,
    pageSize: 25,
    total: entries.length,
    integrity: {
      totalIssues: 3,
      usersMissingWaitlistEntry: 2,
      entriesMissingUser: 1,
      signedUpEntriesMissingUser: 0,
    },
  },
};
export const Healthy: Story = {
  args: {
    ...IntegrityAndSelection.args,
    integrity: {
      totalIssues: 0,
      usersMissingWaitlistEntry: 0,
      entriesMissingUser: 0,
      signedUpEntriesMissingUser: 0,
    },
  },
};
export const Empty: Story = {
  args: { entries: [], page: 1, pageSize: 25, total: 0 },
};
