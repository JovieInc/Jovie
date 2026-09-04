import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleasesView } from './ReleasesView';

const meta = {
  title: 'Profile/ReleasesView',
  component: ReleasesView,
  parameters: { layout: 'centered' },
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
