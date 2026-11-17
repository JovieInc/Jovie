import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { DspPresenceItem } from '@/app/app/(shell)/dashboard/presence/actions';
import { DspPresenceTable } from './DspPresenceTable';

function item(overrides: Partial<DspPresenceItem>): DspPresenceItem {
  return {
    matchId: 'm-spotify',
    providerId: 'spotify',
    externalArtistName: 'Tim White',
    externalArtistImageUrl: null,
    externalArtistUrl: 'https://open.spotify.com/artist/1',
    confidenceScore: 0.92,
    confidenceBreakdown: null,
    matchingIsrcCount: 12,
    status: 'confirmed',
    matchSource: null,
    confirmedAt: null,
    ...overrides,
  };
}

const withFrame: Decorator = function WithFrame(Story) {
  return (
    <div className='h-96 w-full max-w-3xl'>
      <Story />
    </div>
  );
};

const withRtl: Decorator = function WithRtl(Story) {
  return (
    <div dir='rtl' className='h-full'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Features/Dashboard/Organisms/DspPresence/DspPresenceTable States',
  component: DspPresenceTable,
  decorators: [withFrame],
  parameters: { layout: 'padded' },
  args: {
    items: [
      item({}),
      item({
        matchId: 'm-apple',
        providerId: 'apple_music',
        status: 'suggested',
      }),
      item({
        matchId: 'm-deezer',
        providerId: 'deezer',
        matchSource: 'manual',
      }),
    ],
    selectedMatchId: null,
    onRowSelect: fn(),
  },
} satisfies Meta<typeof DspPresenceTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyNoMatches: Story = {
  args: { items: [] },
};

export const LongContentNames: Story = {
  args: {
    items: [
      item({
        externalArtistName:
          'Tim White and the International Orchestra of Experimental Electronic Music',
      }),
      item({
        matchId: 'm-tidal',
        providerId: 'tidal',
        externalArtistName: null,
        externalArtistUrl: null,
        status: 'suggested',
      }),
      ...(
        [
          'youtube_music',
          'soundcloud',
          'amazon_music',
          'musicbrainz',
          'genius',
          'discogs',
          'allmusic',
        ] as const
      ).map(providerId =>
        item({
          matchId: `m-${providerId}`,
          providerId,
          status: 'auto_confirmed',
        })
      ),
    ],
    selectedMatchId: 'm-tidal',
  },
};

export const RtlDocument: Story = {
  decorators: [withRtl],
  args: {
    items: [
      item({ externalArtistName: 'تيم وايت' }),
      item({
        matchId: 'm-apple',
        providerId: 'apple_music',
        externalArtistName: 'טים וייט',
        status: 'suggested',
      }),
    ],
    selectedMatchId: 'm-apple',
  },
};
