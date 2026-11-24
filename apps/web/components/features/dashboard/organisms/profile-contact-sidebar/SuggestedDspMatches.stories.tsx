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

const longNameMatch: DspMatch = {
  ...unknownMatch,
  id: 'long-name',
  providerId: 'spotify',
  externalArtistName:
    'The Extremely Long Collaborative Ensemble Featuring Endless Guest Artists And Affiliates',
  externalArtistUrl: 'https://open.spotify.com/artist/story',
};

type StoryParams = {
  readonly matches?: DspMatch[];
  readonly queryMode?: 'data' | 'loading' | 'error';
};

const meta = {
  title: 'Dashboard/ProfileContactSidebar/SuggestedDspMatches',
  component: SuggestedDspMatches,
  parameters: {
    layout: 'padded',
    matches: [unknownMatch],
    queryMode: 'data',
  } satisfies StoryParams & { layout: 'padded' },
  args: { profileId: 'story-profile' },
  decorators: [
    (Story, context) => {
      const client = createDashboardQueryClient();
      const key = queryKeys.dspEnrichment.matches(
        context.args.profileId,
        'suggested'
      );
      const mode =
        (context.parameters.queryMode as StoryParams['queryMode']) ?? 'data';

      if (mode === 'loading') {
        void client.prefetchQuery({
          queryKey: key,
          queryFn: () => new Promise<DspMatch[]>(() => undefined),
        });
      } else if (mode === 'error') {
        client
          .getQueryCache()
          .build<DspMatch[], Error>(client, { queryKey: key })
          .setState({
            status: 'error',
            error: new Error('Could not load suggestions'),
            fetchStatus: 'idle',
          });
      } else {
        client.setQueryData(
          key,
          (context.parameters.matches as DspMatch[] | undefined) ?? []
        );
      }

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

/** Zero-footprint loading sentinel (JOV-4159 — no skeleton flash). */
export const Loading: Story = {
  parameters: { queryMode: 'loading', matches: undefined },
};

/** Query failure face with Retry. */
export const ErrorLoadFailed: Story = {
  parameters: { queryMode: 'error' },
};

/** Narrow frame so a long artist name truncates. */
export const LongContent: Story = {
  parameters: { matches: [longNameMatch] },
  decorators: [
    Story => (
      <div className='w-48'>
        <Story />
      </div>
    ),
  ],
};

/** RTL overflow frame for the match row. */
export const Rtl: Story = {
  parameters: { matches: [longNameMatch] },
  decorators: [
    Story => (
      <div dir='rtl' className='w-64'>
        <Story />
      </div>
    ),
  ],
};

export const Empty: Story = {
  parameters: { matches: [] },
};
