import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { ChatAlbumArtCandidate } from '../types';
import { ChatAlbumArtSwipeReview } from './ChatAlbumArtSwipeReview';

const candidates: ChatAlbumArtCandidate[] = [
  {
    id: 'candidate-1',
    styleId: 'dream-pop',
    styleLabel: 'Dream Pop',
    previewUrl: 'https://placehold.co/256x256',
    fullResUrl: 'https://placehold.co/1024x1024',
  },
  {
    id: 'candidate-2',
    styleId: 'vaporwave',
    styleLabel: 'Vaporwave',
    previewUrl: 'https://placehold.co/256x256',
    fullResUrl: 'https://placehold.co/1024x1024',
  },
];

const meta = {
  title: 'Jovie/Components/ChatAlbumArtSwipeReview',
  component: ChatAlbumArtSwipeReview,
  parameters: {
    layout: 'centered',
  },
  args: {
    releaseTitle: 'Skyline Dreams',
    candidates,
    appliedCandidateId: null,
    isActionPending: false,
    onAccept: fn(),
    onRequestMore: fn(),
    onExitSwipeMode: fn(),
  },
  decorators: [
    Story => (
      <div className='w-sm max-w-full'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChatAlbumArtSwipeReview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReviewDeck: Story = {};

export const Applied: Story = {
  args: {
    appliedCandidateId: 'candidate-1',
  },
};

export const Pending: Story = {
  args: {
    isActionPending: true,
  },
};

export const Exhausted: Story = {
  args: {
    candidates: [],
  },
};

/** A set that came back with no candidates opens straight on the request-more panel. */
export const EmptyCandidateSet: Story = {
  args: {
    candidates: [],
  },
};

/** Long release and style names wrap in the legend, footer and button labels. */
export const LongContent: Story = {
  args: {
    releaseTitle:
      'The Extended Midnight Drive Sessions (Deluxe Anniversary Edition)',
    candidates: candidates.map((candidate, index) => ({
      ...candidate,
      id: `long-${candidate.id}`,
      styleLabel:
        index === 0
          ? 'Hand-Painted Watercolor Collage With Film Grain'
          : 'Retro Futurist Chrome Typography On Dusk Gradient',
    })),
  },
};

/** Right-to-left: the reject and accept pair mirrors; arrow keys keep their meaning. */
export const RtlReview: Story = {
  args: {
    releaseTitle: 'ليلة في القاهرة',
    candidates: candidates.map(candidate => ({
      ...candidate,
      id: `rtl-${candidate.id}`,
      styleLabel: 'بوب حالم',
    })),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
