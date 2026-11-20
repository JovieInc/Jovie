import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleasesView } from './ReleasesView';

const meta = {
  title: 'Profile/ReleasesView',
  component: ReleasesView,
  parameters: { layout: 'centered' },
  // ReleasesView is a dark-surface profile drawer view (white-on-dark type);
  // give the centered canvas the dark base so axe measures the intended
  // contrast context.
  decorators: [
    Story => (
      <div className='w-full max-w-md bg-base'>
        <Story />
      </div>
    ),
  ],
  args: {
    artistId: 'artist-1',
    artistHandle: 'tim',
    artistName: 'Tim White',
    releases: [
      {
        id: 'release-1',
        title: 'Never Say A Word',
        slug: 'never-say-a-word',
        releaseType: 'single',
        releaseDate: '2026-03-10T00:00:00.000Z',
        revealDate: null,
        artworkUrl: '/art.jpg',
        artistNames: ['Tim White'],
      },
    ],
  },
} satisfies Meta<typeof ReleasesView>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
