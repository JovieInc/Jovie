import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import {
  ARTIST_PROFILE_SOCIAL_PROOF,
  type ArtistProfileSocialProofData,
} from '@/data/socialProof';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ArtistProfileReleaseCycleGallery,
  ArtistProfileSocialProof,
} from './ArtistProfileSocialProof';

const QUOTE = {
  id: 'founder',
  name: 'Tim White',
  role: 'Founder, Jovie',
  quote: 'We built Jovie for music.',
};

const OPEN: ArtistProfileSocialProofData = {
  ...ARTIST_PROFILE_SOCIAL_PROOF,
  quotes: [QUOTE],
  hasRealQuotes: true,
};

describe('ArtistProfileSocialProof', () => {
  it('renders nothing while the real-quote gate is closed', () => {
    const { container } = render(
      <ArtistProfileSocialProof
        socialProof={ARTIST_PROFILE_COPY.socialProof}
        proofData={{ ...OPEN, hasRealQuotes: false }}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders each verified quote with its name and role', async () => {
    const { container } = render(
      <ArtistProfileSocialProof
        socialProof={ARTIST_PROFILE_COPY.socialProof}
        proofData={OPEN}
      />
    );

    expect(
      screen.getByRole('heading', {
        name: ARTIST_PROFILE_COPY.socialProof.headline,
      })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText(QUOTE.quote)).toBeInTheDocument();
    expect(screen.getByText(QUOTE.name)).toBeInTheDocument();
    expect(screen.getByText(QUOTE.role)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps only the header when the gate is open with no quotes', async () => {
    const { container } = render(
      <ArtistProfileSocialProof
        socialProof={ARTIST_PROFILE_COPY.socialProof}
        proofData={{ ...OPEN, quotes: [] }}
      />
    );

    expect(screen.queryAllByRole('article')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('renders Arabic quotes in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistProfileSocialProof
          socialProof={{ headline: 'مصمم للفنانين.', intro: 'قصص موثقة.' }}
          proofData={{ ...OPEN, quotes: [{ ...QUOTE, quote: 'بنينا هذا.' }] }}
        />
      </div>
    );

    expect(screen.getByText('بنينا هذا.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe('ArtistProfileReleaseCycleGallery', () => {
  it('renders three captioned release-cycle moments in a labelled rail', async () => {
    const { container } = render(
      <ArtistProfileReleaseCycleGallery
        id='release-cycle'
        releaseCycle={ARTIST_PROFILE_COPY.releaseCycle}
      />
    );

    expect(
      screen.getByRole('heading', {
        name: ARTIST_PROFILE_COPY.releaseCycle.headline,
      })
    ).toBeInTheDocument();
    expect(container.querySelectorAll('figure')).toHaveLength(3);
    expect(screen.getByText('Before The Drop')).toBeInTheDocument();
    expect(screen.getByText('Nearby Tickets')).toBeInTheDocument();
    expect(
      screen.getByTestId('marketing-section-product-gallery')
    ).toHaveAttribute('id', 'release-cycle');
    await expectNoA11yViolations(container);
  });
});
