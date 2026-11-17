import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import { CreatorProfileTableRow } from './CreatorProfileTableRow';

const profile: AdminCreatorProfileRow = {
  id: 'creator_1',
  username: 'alice',
  usernameNormalized: 'alice',
  avatarUrl: null,
  displayName: 'Alice Artist',
  isVerified: false,
  isFeatured: false,
  marketingOptOut: false,
  isClaimed: false,
  claimToken: null,
  claimTokenExpiresAt: null,
  userId: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  ingestionStatus: 'idle',
  lastIngestionError: null,
  location: null,
  hometown: null,
  activeSinceYear: null,
  socialLinks: [],
};

const link = (id: string, platform: string, url: string) => ({
  id,
  platform,
  platformType: 'social',
  url,
  displayText: null,
});

/** State coverage for one admin creator profiles row; Default and Selected live in CreatorProfileTableRow.stories.tsx. */
const meta = {
  title: 'Features/Admin/CreatorProfileTableRow States',
  component: CreatorProfileTableRow,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <table className='w-full bg-base text-primary-token'>
        <tbody>
          <Story />
        </tbody>
      </table>
    ),
  ],
  args: {
    profile,
    rowNumber: 1,
    isSelected: false,
    isChecked: false,
    isMobile: false,
    verificationStatus: 'idle',
    refreshIngestStatus: 'idle',
    isMenuOpen: false,
    onRowClick: fn(),
    onContextMenu: fn(),
    onToggleSelect: fn(),
    onMenuOpenChange: fn(),
    onRefreshIngest: fn(),
    onToggleVerification: fn(),
    onToggleFeatured: fn(),
    onToggleMarketing: fn(),
    onDelete: fn(),
  },
} satisfies Meta<typeof CreatorProfileTableRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: verification and ingest refresh are both in flight. */
export const LoadingRowActions: Story = {
  args: { verificationStatus: 'loading', refreshIngestStatus: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Alice Artist')
    ).toBeInTheDocument();
  },
};

/** Empty: no display name, links or join date yet; the row falls back to the handle and dashes. */
export const EmptyProfileDetails: Story = {
  args: {
    profile: {
      ...profile,
      displayName: null,
      createdAt: null,
      socialLinks: [],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', { name: '@alice' })
    ).toBeInTheDocument();
  },
};

/** Error: the last verification and ingest refresh failed. */
export const ErrorActionsFailed: Story = {
  args: {
    profile: {
      ...profile,
      ingestionStatus: 'failed',
      lastIngestionError: 'Spotify rate limited the refresh',
    },
    verificationStatus: 'error',
    refreshIngestStatus: 'error',
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Alice Artist')
    ).toBeInTheDocument();
  },
};

/** Partial: an unclaimed profile with a claim link and one social link, no display name. */
export const PartialUnclaimedOneLink: Story = {
  args: {
    profile: {
      ...profile,
      displayName: null,
      claimToken: 'claim_token_1',
      socialLinks: [link('ig', 'instagram', 'https://instagram.com/alice')],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', { name: '@alice' })
    ).toBeInTheDocument();
  },
};

const LONG_NAME =
  'The Extraordinarily Long Named Orchestra and Friends Featuring Everyone';

/** Long content: a long name and handle, a high row number and many links. */
export const LongContentNameAndLinks: Story = {
  args: {
    rowNumber: 12_345,
    isChecked: true,
    profile: {
      ...profile,
      displayName: LONG_NAME,
      username: 'the-extraordinarily-long-named-orchestra-and-friends',
      isVerified: true,
      isFeatured: true,
      socialLinks: [
        link('ig', 'instagram', 'https://instagram.com/long_orchestra_name'),
        link('tt', 'tiktok', 'https://tiktok.com/@long_orchestra_name'),
        link('yt', 'youtube', 'https://youtube.com/@longorchestraname'),
        link('x', 'x', 'https://x.com/long_orchestra'),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(LONG_NAME)
    ).toBeInTheDocument();
  },
};

/** Right-to-left: an Arabic display name inside an RTL document. */
export const RtlArabic: Story = {
  args: { profile: { ...profile, displayName: 'فنانة جوفي' } },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('فنانة جوفي')
    ).toBeInTheDocument();
  },
};
