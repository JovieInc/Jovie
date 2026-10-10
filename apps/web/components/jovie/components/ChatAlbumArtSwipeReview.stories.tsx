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
