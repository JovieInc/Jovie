import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import {
  ARTIST_PROFILE_SOCIAL_PROOF,
  type ArtistProfileSocialProofData,
} from '@/data/socialProof';
import {
  ArtistProfileReleaseCycleGallery,
  ArtistProfileSocialProof,
} from './ArtistProfileSocialProof';

// The gate opens once real quotes exist. Fixture reuses the real founder
// quote from @/data/socialProof in the `quotes` shape the gate checks.
const VERIFIED_PROOF: ArtistProfileSocialProofData = {
  ...ARTIST_PROFILE_SOCIAL_PROOF,
  quotes: ARTIST_PROFILE_SOCIAL_PROOF.founderQuote
    ? [
        {
          id: 'founder',
          name: ARTIST_PROFILE_SOCIAL_PROOF.founderQuote.name,
          role: ARTIST_PROFILE_SOCIAL_PROOF.founderQuote.role,
          quote: ARTIST_PROFILE_SOCIAL_PROOF.founderQuote.quote,
        },
      ]
    : [],
  hasRealQuotes: true,
};

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileSocialProof',
  component: ArtistProfileSocialProof,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    socialProof: ARTIST_PROFILE_COPY.socialProof,
    proofData: VERIFIED_PROOF,
  },
} satisfies Meta<typeof ArtistProfileSocialProof>;

export default meta;
type Story = StoryObj<typeof meta>;

// Verified quotes gate open (production gate is currently closed until three
// or more real quotes land; see hasRealQuotes in @/data/socialProof).
export const VerifiedQuotes: Story = {};

export const ReleaseCycleGallery: StoryObj<
  typeof ArtistProfileReleaseCycleGallery
> = {
  render: () => (
    <ArtistProfileReleaseCycleGallery
      releaseCycle={ARTIST_PROFILE_COPY.releaseCycle}
    />
  ),
};
