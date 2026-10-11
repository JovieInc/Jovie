import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type {
  CustomerRecoveryDossier,
  CustomerRecoveryResult,
} from '@/lib/admin/customer-recovery';
import { CustomerRecoveryPanel } from './CustomerRecoveryPanel';

const dossier: CustomerRecoveryDossier = {
  identity: {
    dedupeKey: 'user:u1',
    displayName: 'Phoebe Bridgers',
    email: 'phoebe@example.com',
    handle: 'phoebe',
    stage: 'claimed',
    overrideStage: null,
    sources: ['waitlist', 'creator_profile'],
    certifiedAt: null,
    activityAt: null,
    userId: 'u1',
    creatorProfileId: 'cp1',
    leadId: null,
    waitlistEntryId: 'w1',
  },
  account: {
    userStatus: 'active',
    plan: 'pro',
    isPro: true,
    isPaying: true,
    deletedAt: null,
  },
  authority: {
    profileClaimed: true,
    claimedAt: '2026-09-01T00:00:00.000Z',
    isVerified: false,
    ingestionStatus: 'failed',
    lastIngestionError: 'spotify timeout',
    hasSpotifySource: true,
  },
  admission: {
    status: 'approved',
    approvedAt: '2026-08-01T00:00:00.000Z',
    invitedAt: null,
    signedUpAt: '2026-08-02T00:00:00.000Z',
  },
  connections: { activeSocialLinks: 4 },
  launch: { releaseCount: 3, latestReleaseTitle: 'Punisher' },
  recentOperations: [
    {
      type: 'artist-ingest',
      result: 'failed',
      failureReason: 'spotify timeout',
      createdAt: '2026-09-15T00:00:00.000Z',
    },
  ],
  blocker: {
    kind: 'ingestion-failed',
    summary: 'Artist ingestion failed and can be re-run.',
    operation: 'rerun-ingestion',
    preconditionNote: null,
  },
};

const baseResult: CustomerRecoveryResult = {
  search: 'phoebe',
  matches: [],
  dossier,
  error: null,
  generatedAt: '2026-10-02T12:00:00.000Z',
};

const meta = {
  title: 'Features/Admin/CustomerRecovery/CustomerRecoveryPanel',
  component: CustomerRecoveryPanel,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='min-h-screen bg-surface-0 p-6 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: { result: baseResult },
} satisfies Meta<typeof CustomerRecoveryPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dossier: Story = {};

export const AmbiguousMatches: Story = {
  args: {
    result: {
      ...baseResult,
      dossier: null,
      matches: [
        {
          dedupeKey: 'user:u1',
          displayName: 'Phoebe Bridgers',
          email: 'phoebe@example.com',
          handle: 'phoebe',
          stage: 'claimed',
        },
        {
          dedupeKey: 'lead:l2',
          displayName: null,
          email: 'p.b@example.com',
          handle: null,
          stage: 'suggested',
        },
      ],
    },
  },
};

export const NoMatches: Story = {
  args: {
    result: { ...baseResult, dossier: null, matches: [] },
  },
};

export const Unavailable: Story = {
  args: {
    result: {
      ...baseResult,
      dossier: null,
      matches: [],
      error: 'unavailable',
    },
  },
};

export const ReadOnlyBlocker: Story = {
  args: {
    result: {
      ...baseResult,
      dossier: {
        ...dossier,
        blocker: {
          kind: 'ingestion-in-flight',
          summary: 'An ingestion run is already in flight.',
          operation: null,
          preconditionNote: 'Wait for the current run to finish.',
        },
      },
    },
  },
};
