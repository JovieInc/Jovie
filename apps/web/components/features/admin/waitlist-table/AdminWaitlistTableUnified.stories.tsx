import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import { AdminWaitlistTableUnified } from './AdminWaitlistTableUnified';

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

const meta: Meta<typeof AdminWaitlistTableUnified> = {
  title: 'Admin/Tables/Waitlist',
  component: AdminWaitlistTableUnified,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    entries,
    page: 1,
    pageSize: 25,
    total: entries.length,
    hasNextPage: false,
    isFetchingNextPage: false,
    onLoadMore: () => undefined,
  },
};

export const Empty: Story = {
  args: {
    entries: [],
    page: 1,
    pageSize: 25,
    total: 0,
  },
};
