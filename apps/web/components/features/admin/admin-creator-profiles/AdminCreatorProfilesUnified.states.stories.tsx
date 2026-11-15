import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, screen, userEvent } from 'storybook/test';
import { FeedbackProvider } from '@/components/feedback';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import { AdminCreatorProfilesUnified } from './AdminCreatorProfilesUnified';

const CREATED_AT = new Date('2026-01-01T00:00:00Z');

function creator(
  id: string,
  displayName: string,
  overrides: Partial<AdminCreatorProfileRow> = {}
): AdminCreatorProfileRow {
  return {
    id,
    username: id,
    usernameNormalized: id.toLowerCase(),
    displayName,
    avatarUrl: null,
    isVerified: false,
    isFeatured: false,
    marketingOptOut: false,
    location: null,
    hometown: null,
    activeSinceYear: null,
    isClaimed: true,
    claimToken: null,
    claimTokenExpiresAt: null,
    userId: `user-${id}`,
    createdAt: CREATED_AT,
    confidence: 0.8,
    ingestionStatus: 'idle',
    lastIngestionError: null,
    socialLinks: [
      {
        id: `${id}-instagram`,
        platform: 'instagram',
        platformType: 'social',
        url: `https://instagram.com/${id}`,
        displayText: `@${id}`,
      },
    ],
    ...overrides,
  };
}

const errorRows = [creator('signalbloom', 'Signal Bloom')];

const longRows = [
  creator(
    'theextraordinarilylongnamedorchestraofthenorthernhemisphere',
    'The Extraordinarily Long Named Orchestra Of The Northern Hemisphere And Friends',
    {
      isVerified: true,
      location: 'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch',
    }
  ),
  creator('a', 'A'),
];

const rtlRows = [
  creator('layla', 'ليلى الموسيقية', { location: 'القاهرة' }),
  creator('noam', 'נועם המוזיקאי', { location: 'תל אביב' }),
];

const meta: Meta<typeof AdminCreatorProfilesUnified> = {
  title: 'Admin/Tables/CreatorProfiles States',
  component: AdminCreatorProfilesUnified,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <RightPanelProvider>
        <div className='h-200 bg-base text-primary-token'>
          <Story />
        </div>
      </RightPanelProvider>
    ),
  ],
  args: { page: 1, pageSize: 20, search: '', sort: 'created_desc' },
};

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * A row action whose request fails. The verify route is not served in
 * Storybook, so the request fails and the table raises its failure toast.
 */
export const ErrorVerifyFailed: Story = {
  args: {
    profiles: errorRows,
    total: errorRows.length,
    onActionError: fn(),
  },
  decorators: [
    Story => (
      <FeedbackProvider>
        <Story />
      </FeedbackProvider>
    ),
  ],
  play: async ({ args }) => {
    await userEvent.click(
      await screen.findByRole('button', { name: 'More actions' })
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Verify Creator' })
    );
    // The harness's mock '/test' pathname is a profile route, where
    // FeedbackProvider mounts no Toaster — the failure toast can never
    // render in this lane. The surface reports the failure to its owner;
    // assert the exact message through the reporter (ProfileSidebarHeader
    // convention).
    await expect(args.onActionError).toHaveBeenCalledWith(
      'Failed to verify creator'
    );
  },
};

/** Very long names, handles and locations next to a one-letter row. */
export const LongContentNamesAndHandles: Story = {
  args: { profiles: longRows, total: longRows.length },
};

/** Right-to-left document with Arabic and Hebrew creator names. */
export const RtlDocument: Story = {
  args: { profiles: rtlRows, total: rtlRows.length },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
