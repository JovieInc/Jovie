import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_NOTIFICATIONS_COPY } from '@/data/artistNotificationsCopy';
import { ARTIST_NOTIFICATIONS_SPEC_TILES } from '@/data/artistNotificationsFeatures';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_TRUTH_TILES } from '@/data/artistProfileFeatures';
import { ArtistProfileSpecWall } from './ArtistProfileSpecWall';

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileSpecWall States',
  component: ArtistProfileSpecWall,
  parameters: { layout: 'fullscreen' },
  args: { specWall: ARTIST_PROFILE_COPY.specWall },
} satisfies Meta<typeof ArtistProfileSpecWall>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no tiles of either kind, so only the header renders. */
export const EmptyTiles: Story = {
  args: { tiles: [] },
};

/** Empty: the truth wall with an empty tile list keeps its header and rule. */
export const EmptyTruthWall: Story = {
  args: { truthTiles: [] },
};

/** Partial: a bento with only its first two feature tiles supplied. */
export const PartialBento: Story = {
  args: {
    specWall: ARTIST_NOTIFICATIONS_COPY.specWall,
    tiles: ARTIST_NOTIFICATIONS_SPEC_TILES.slice(0, 2),
  },
};

/** Long content: long headline, subhead and truth-tile body copy. */
export const LongContentTruthWall: Story = {
  args: {
    specWall: {
      ...ARTIST_PROFILE_COPY.specWall,
      headline:
        'Your music stays together and the right action leads, on every service, every show and every release week.',
      subhead: `${ARTIST_PROFILE_COPY.specWall.subhead} ${ARTIST_PROFILE_COPY.specWall.subhead}`,
    },
    truthTiles: ARTIST_PROFILE_TRUTH_TILES.map(tile => ({
      ...tile,
      body: `${tile.body} ${tile.body}`,
    })),
  },
};

/** Right-to-left: Arabic header and truth tiles in an Arabic document. */
export const RtlArabicTruthWall: Story = {
  args: {
    specWall: {
      ...ARTIST_PROFILE_COPY.specWall,
      headline: 'موسيقاك تبقى معاً.',
      subhead: 'يختار المستمعون أين يستمعون من ملف واحد.',
    },
    truthTiles: ARTIST_PROFILE_TRUTH_TILES.slice(0, 3).map(tile => ({
      ...tile,
      title: 'تحميل سريع',
      body: 'يفتح الملف بسرعة على كل هاتف.',
    })),
  },
  decorators: [
    function WithArabicDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
