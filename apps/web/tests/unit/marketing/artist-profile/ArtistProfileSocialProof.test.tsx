import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ArtistProfileReleaseCycleGallery,
  ArtistProfileSocialProof,
} from '@/components/marketing/artist-profile/ArtistProfileSocialProof';
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
  it('renders verified quotes only when the proof gate is open', () => {
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

  it('keeps the release-cycle gallery outside the social-proof contract', () => {
    render(
      <ArtistProfileReleaseCycleGallery
        releaseCycle={ARTIST_PROFILE_COPY.releaseCycle}
      />
    );

    expect(screen.getByText('One profile across three moments.')).toBeVisible();
    expect(screen.getByText('Release Alerts')).toBeVisible();
    expect(screen.queryByText('Pre-Save')).not.toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(
      screen.getByRole('region', {
        name: /one artist profile across three release-cycle moments/i,
      })
    ).toBeVisible();
  });
});
