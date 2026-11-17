import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import { AdminCreatorsPageWrapper } from './AdminCreatorsPageWrapper';

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
    isClaimed: false,
    claimToken: null,
    claimTokenExpiresAt: null,
    userId: null,
    createdAt: new Date('2026-01-15T12:00:00.000Z'),
    confidence: 0.5,
    ingestionStatus: 'idle',
    lastIngestionError: null,
    socialLinks: [],
    ...overrides,
  };
}

const longContentProfiles: AdminCreatorProfileRow[] = [
  creator(
    'the-extraordinarily-long-collective-handle-for-overflow-checks',
    'The Extraordinarily Long Named Midnight Orchestra And Friends Collective',
    {
      isVerified: true,
      ingestionStatus: 'failed',
      lastIngestionError:
        'Failed to fetch profile data from the upstream platform after several retries because the request kept timing out.',
    }
  ),
  creator('ari', 'Ari Lane', { isClaimed: true, userId: 'user-ari' }),
];

const rtlProfiles: AdminCreatorProfileRow[] = [
  creator('layla', 'ليلى الموسيقية', { isVerified: true }),
  creator('noam', 'נועם הזמר'),
];

const withAdminShell: Decorator = function AdminShellDecorator(Story) {
  return (
    <RightPanelProvider>
      <HeaderActionsProvider>
        <Story />
      </HeaderActionsProvider>
    </RightPanelProvider>
  );
};

const withRtlDirection: Decorator = function RtlDirectionDecorator(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Features/Admin/AdminCreatorsPageWrapper States',
  component: AdminCreatorsPageWrapper,
  parameters: { layout: 'fullscreen' },
  decorators: [withAdminShell],
  args: {
    profiles: [],
    page: 1,
    pageSize: 25,
    total: 0,
    search: '',
    sort: 'created_desc',
  },
} satisfies Meta<typeof AdminCreatorsPageWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Very long creator names, handles and ingestion errors must truncate cleanly. */
export const LongContent: Story = {
  args: {
    profiles: longContentProfiles,
    total: longContentProfiles.length,
    search: 'the-extraordinarily-long-collective-handle-for-overflow-checks',
  },
};

/** Right-to-left document with Arabic and Hebrew creator names. */
export const Rtl: Story = {
  decorators: [withRtlDirection],
  args: {
    profiles: rtlProfiles,
    total: rtlProfiles.length,
  },
};
