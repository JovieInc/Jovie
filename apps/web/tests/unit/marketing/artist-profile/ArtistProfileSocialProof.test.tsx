import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArtistProfileSocialProof } from '@/components/marketing/artist-profile/ArtistProfileSocialProof';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import type { ArtistProfileSocialProofData } from '@/data/socialProof';

const realProof: ArtistProfileSocialProofData = {
  proofWhisper: 'Artist proof',
  logos: [],
  profileCards: [],
  quotes: [
    {
      id: 'real-artist',
      name: 'A Real Artist',
      role: 'Independent artist',
      quote: 'This is a verified artist quote.',
    },
  ],
  founderFallback: 'Built with artists.',
  hasRealQuotes: true,
};

describe('ArtistProfileSocialProof', () => {
  it('renders verified artist quotes when the proof gate is open', () => {
    render(
      <ArtistProfileSocialProof
        socialProof={ARTIST_PROFILE_COPY.socialProof}
        proofData={realProof}
      />
    );

    expect(
      screen.getByRole('heading', {
        name: ARTIST_PROFILE_COPY.socialProof.headline,
      })
    ).toBeInTheDocument();
    expect(screen.getByText('This is a verified artist quote.')).toBeVisible();
    expect(screen.getByText('A Real Artist')).toBeVisible();
    expect(screen.getByText('Independent artist')).toBeVisible();
  });

  it('renders nothing when the proof gate is closed', () => {
    const { container } = render(
      <ArtistProfileSocialProof
        socialProof={ARTIST_PROFILE_COPY.socialProof}
        proofData={{ ...realProof, quotes: [], hasRealQuotes: false }}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
