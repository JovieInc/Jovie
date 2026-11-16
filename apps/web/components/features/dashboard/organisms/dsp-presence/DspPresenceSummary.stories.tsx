import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import type { EnrichmentStatus } from '@/lib/queries/useDspEnrichmentStatusQuery';
import { DspPresenceSummary } from './DspPresenceSummary';

const discovering: EnrichmentStatus = {
  profileId: 'story-profile',
  overallPhase: 'discovering',
  overallProgress: 40,
  providers: [],
  discoveryStartedAt: '2026-09-01T12:00:00.000Z',
  discoveryCompletedAt: null,
  enrichmentStartedAt: null,
  enrichmentCompletedAt: null,
};

const SummaryShell: Decorator = function SummaryShell(Story) {
  return (
    <TableMetaProvider>
      <div className='w-full max-w-2xl bg-base text-primary-token'>
        <Story />
      </div>
    </TableMetaProvider>
  );
};

const RtlShell: Decorator = function RtlShell(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Features/Dashboard/DSP Presence/DspPresenceSummary',
  component: DspPresenceSummary,
  parameters: { layout: 'padded' },
  decorators: [SummaryShell],
  args: {
    confirmedCount: 4,
    suggestedCount: 2,
    profileId: 'story-profile',
    isAdmin: true,
    spotifyId: 'spotify-artist-1',
    onAddPlatform: () => undefined,
  },
} satisfies Meta<typeof DspPresenceSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: matched platforms with pending suggestions, admin refresh shown. */
export const Default: Story = {};

/** Loading: platform discovery is running, so refresh is disabled. */
export const LoadingDiscovery: Story = {
  args: { enrichmentStatus: discovering },
};

/** Empty: no matched platforms and nothing pending. */
export const EmptyNoPlatforms: Story = {
  args: { confirmedCount: 0, suggestedCount: 0 },
};

/** Partial: an admin without Spotify connected cannot start discovery. */
export const PartialNoSpotify: Story = {
  args: { spotifyId: null },
};

/** Long content: large counts beside the running discovery phase label. */
export const LongContentLargeCounts: Story = {
  args: {
    confirmedCount: 12_480,
    suggestedCount: 3_215,
    enrichmentStatus: discovering,
  },
};

/** Permission denied: non-admins see the counts without the refresh action. */
export const PermissionDeniedNonAdmin: Story = {
  args: { isAdmin: false },
};

/** Right-to-left: the toolbar in a right-to-left document. */
export const RtlToolbar: Story = {
  decorators: [RtlShell],
  args: { enrichmentStatus: discovering },
};
