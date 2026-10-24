import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import {
  createDashboardQueryClient,
  DashboardStoryProviders,
} from '@/.storybook/dashboard-fixtures';
import { queryKeys } from '@/lib/queries/keys';
import type { DspMatch } from '@/lib/queries/useDspMatchesQuery';
import { SuggestedDspMatches } from './SuggestedDspMatches';

const unknownMatch: DspMatch = {
  id: 'unknown-artist',
  providerId: 'apple_music',
  externalArtistId: 'story-artist',
  externalArtistName: 'Uninspected Artist',
  externalArtistUrl: null,
  externalArtistImageUrl: null,
  confidenceScore: null,
  confidenceBreakdown: null,
  matchingIsrcCount: 0,
  matchingUpcCount: 0,
  totalTracksChecked: 0,
  status: 'suggested',
  createdAt: '2026-10-14T00:00:00.000Z',
  updatedAt: '2026-10-14T00:00:00.000Z',
};

const measuredZero: DspMatch = {
  ...unknownMatch,
  id: 'measured-zero',
  providerId: 'youtube_music',
  externalArtistName: 'Measured Artist',
  confidenceScore: 0,
  totalTracksChecked: 1,
  confidenceBreakdown: {
    isrcMatchScore: 0,
    upcMatchScore: 0,
    nameSimilarityScore: 0,
    followerRatioScore: 0,
    genreOverlapScore: 0,
  },
};

const meta = {
  title: 'Dashboard/ProfileContactSidebar/SuggestedDspMatches',
  component: SuggestedDspMatches,
  parameters: { layout: 'padded', matches: [unknownMatch] },
  args: { profileId: 'story-profile' },
  decorators: [
    (Story, context) => {
      const client = createDashboardQueryClient();
      client.setQueryData(
        queryKeys.dspEnrichment.matches(context.args.profileId, 'suggested'),
        context.parameters.matches as DspMatch[]
      );
      return (
        <DashboardStoryProviders queryClient={client}>
          <Story />
        </DashboardStoryProviders>
      );
    },
  ],
} satisfies Meta<typeof SuggestedDspMatches>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnknownConfidence: Story = {
  play: async ({ canvas, canvasElement }) => {
    const actions = canvas.getAllByRole('button', {
      name: /^(Confirm|Reject) .+ match for Uninspected Artist$/,
    });
    await expect(actions).toHaveLength(2);

    for (const action of actions) {
      action.focus();
      await expect(action).toHaveFocus();
      const bounds = action.getBoundingClientRect();
      const hit = canvasElement.ownerDocument.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top - 1
      );
      // The invisible hit area extends beyond the visible button without
      // changing the row layout or redirecting input to the popover trigger.
      await expect(hit?.closest('button')).toBe(action);
    }
  },
};

export const MeasuredZero: Story = {
  parameters: { matches: [measuredZero] },
};

export const MeasuredZeroBeforeVisibleCap: Story = {
  parameters: {
    matches: [
      ...(
        ['spotify', 'apple_music', 'tidal', 'soundcloud', 'deezer'] as const
      ).map(
        (providerId, index): DspMatch => ({
          ...unknownMatch,
          id: `unknown-${index}`,
          providerId,
          externalArtistName: `Uninspected Artist ${index + 1}`,
        })
      ),
      measuredZero,
    ],
  },
};

export const Empty: Story = {
  parameters: { matches: [] },
};
