import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import {
  ConfirmMatchDialog,
  type ConfirmMatchDialogProps,
} from './ConfirmMatchDialog';

type MatchData = NonNullable<ConfirmMatchDialogProps['matchData']>;

const matchData: MatchData = {
  matchId: 'match-1',
  providerId: 'apple_music',
  externalArtistName: 'Sasha Waves',
  externalArtistUrl: 'https://music.apple.com/artist/sasha-waves',
  externalArtistImageUrl: null,
  confidenceScore: 0.92,
  confidenceBreakdown: {
    isrcMatchScore: 0.95,
    upcMatchScore: 0.8,
    nameSimilarityScore: 1,
    followerRatioScore: 0.7,
    genreOverlapScore: 0.6,
  },
  matchingIsrcCount: 15,
};

const noop = () => undefined;

const meta = {
  title: 'Features/Dashboard/DspMatches/ConfirmMatchDialog',
  component: ConfirmMatchDialog,
  parameters: { layout: 'fullscreen' },
  args: { open: true, onClose: noop, onConfirm: noop, matchData },
} satisfies Meta<typeof ConfirmMatchDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty: no match selected, so nothing renders. */
export const EmptyNoMatch: Story = {
  args: { matchData: null },
};

/** Partial: no confidence breakdown, no artist link and no image. */
export const PartialNoBreakdown: Story = {
  args: {
    matchData: {
      ...matchData,
      externalArtistUrl: null,
      confidenceBreakdown: undefined,
      matchingIsrcCount: 0,
    },
  },
};

/** Long content: a very long artist name truncates beside its link. */
export const LongContentArtistName: Story = {
  args: {
    matchData: {
      ...matchData,
      externalArtistName:
        'Sasha Waves and the Extremely Long Named Touring Collective Orchestra',
    },
  },
};

/** Loading: the confirmation is in flight, so the actions are locked. */
export const LoadingConfirming: Story = {
  args: { isConfirming: true },
};

/** RTL: the dialog mirrors in a right-to-left document. */
export const RtlDialog: Story = {
  decorators: [
    function RtlDecorator(Story: () => ReactNode) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
