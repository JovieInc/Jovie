import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ConfirmMatchDialog } from './ConfirmMatchDialog';

const meta = {
  title: 'Dashboard/Organisms/ConfirmMatchDialog',
  component: ConfirmMatchDialog,
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    onClose: () => undefined,
    onConfirm: () => undefined,
  },
} satisfies Meta<typeof ConfirmMatchDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: a match with a breakdown and an artist page link. */
export const Default: Story = {
  args: {
    matchData: {
      matchId: 'match-1',
      providerId: 'apple_music',
      externalArtistName: 'Nova Lane',
      externalArtistUrl: 'https://music.apple.com/artist/nova-lane',
      confidenceScore: 0.92,
      confidenceBreakdown: {
        isrcMatchScore: 0.9,
        upcMatchScore: 0.8,
        nameSimilarityScore: 1,
        followerRatioScore: 0.7,
        genreOverlapScore: 0.6,
      },
      matchingIsrcCount: 15,
    },
  },
};

/** Empty: no artist image, no link and no breakdown to show. */
export const Empty: Story = {
  args: {
    matchData: {
      matchId: 'match-2',
      providerId: 'spotify',
      externalArtistName: 'Nova Lane',
      confidenceScore: 0.4,
      matchingIsrcCount: 0,
    },
  },
};

/** Partial: a breakdown with low scores and a single ISRC match. */
export const Partial: Story = {
  args: {
    matchData: {
      matchId: 'match-3',
      providerId: 'apple_music',
      externalArtistName: 'Nova Lane',
      confidenceScore: 0.55,
      confidenceBreakdown: {
        isrcMatchScore: 0,
        upcMatchScore: 0,
        nameSimilarityScore: 1,
        followerRatioScore: 0.2,
        genreOverlapScore: 0.1,
      },
      matchingIsrcCount: 1,
    },
  },
};

/** Loading: the confirm request is in flight. */
export const Loading: Story = {
  args: { ...Default.args, isConfirming: true },
};

/** Long content: an artist name that overflows the card. */
export const LongContent: Story = {
  args: {
    matchData: {
      matchId: 'match-4',
      providerId: 'spotify',
      externalArtistName:
        'The Extraordinarily Long Named Orchestra Of The Northern Lights And Friends',
      confidenceScore: 0.81,
      matchingIsrcCount: 128,
    },
  },
};

/** Rtl: right-to-left artist name. */
export const Rtl: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    matchData: {
      matchId: 'match-5',
      providerId: 'apple_music',
      externalArtistName: 'فرقة الشمس الساطعة',
      confidenceScore: 0.77,
      matchingIsrcCount: 3,
    },
  },
};
