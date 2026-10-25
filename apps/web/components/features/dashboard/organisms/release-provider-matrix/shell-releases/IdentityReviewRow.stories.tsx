import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { IdentityReviewRow } from './IdentityReviewRow';

const release = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Seaside Heights',
  artistNames: ['Tim White'],
  status: 'released',
  artworkUrl:
    'https://i.scdn.co/image/ab67616d0000b273c0cd2ad12c56994b4a2f3cac',
  slug: 'seaside-heights',
  smartLinkPath: '/seaside-heights',
  providers: [],
  releaseType: 'single',
  isExplicit: false,
  totalTracks: 1,
  releaseDate: '2020-05-14',
  identityReview: {
    reason: 'owner_not_credited',
    provenance:
      "Found on Spotify · 2020 · Credited to a Tim White, and we can't confirm that's you",
  },
} as unknown as ReleaseViewModel;

const meta = {
  title: 'Dashboard/Releases/IdentityReviewRow',
  component: IdentityReviewRow,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <ul className='m-0 w-full max-w-4xl list-none bg-surface-0 p-0 text-primary-token'>
        <Story />
      </ul>
    ),
  ],
  args: {
    release,
    typeLabel: 'Single',
    commit: async () => ({ ok: true }),
  },
} satisfies Meta<typeof IdentityReviewRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IsThisYou: Story = {};

export const DuplicateCandidate: Story = {
  args: {
    typeLabel: 'EP',
    release: {
      ...release,
      title: 'All This Noise (Remixed)',
      identityReview: {
        reason: 'duplicate_candidate',
        provenance:
          'Found on Spotify · 2015 · Looks like a version of a release you already have',
      },
    },
  },
};
