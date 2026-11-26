import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DspMatchCard } from './DspMatchCard';

const meta = {
  title: 'Dashboard/Molecules/DspMatchCard',
  component: DspMatchCard,
  parameters: {
    layout: 'centered',
  },
  render: args => (
    <div className='w-96'>
      <DspMatchCard {...args} />
    </div>
  ),
  args: {
    matchId: 'match-1',
    providerId: 'apple_music',
    externalArtistName: 'Sasha Waves',
    externalArtistUrl: 'https://music.apple.com/artist/sasha-waves',
    confidenceScore: 0.92,
    matchingIsrcCount: 12,
    status: 'suggested',
    onConfirm: () => {},
    onReject: () => {},
  },
} satisfies Meta<typeof DspMatchCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Suggested: Story = {};

export const WithConfidenceBreakdown: Story = {
  args: {
    confidenceBreakdown: {
      isrcMatchScore: 0.95,
      upcMatchScore: 0.9,
      nameSimilarityScore: 0.98,
      followerRatioScore: 0.8,
      genreOverlapScore: 0.85,
    },
  },
};

export const Confirmed: Story = {
  args: {
    status: 'confirmed',
    onConfirm: undefined,
    onReject: undefined,
  },
};

export const ConfirmingInFlight: Story = {
  args: {
    isConfirming: true,
  },
};

export const LoadingRejecting: Story = {
  args: { isRejecting: true },
};

export const EmptyNoIsrcMatches: Story = {
  args: { matchingIsrcCount: 0, confidenceScore: 0.12 },
};

export const PartialNoLinkOrBreakdown: Story = {
  args: { externalArtistUrl: null, confidenceBreakdown: undefined },
};

export const LongContentArtistName: Story = {
  args: {
    externalArtistName:
      'The Extraordinarily Long Named Midnight Orchestra Featuring Many Special Guests',
    matchingIsrcCount: 1284,
  },
};

export const RtlArtistName: Story = {
  args: { externalArtistName: 'فرقة منتصف الليل' },
};
