import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FeaturedArtistsSection } from './FeaturedArtistsSection';

describe('FeaturedArtistsSection', () => {
  it('exposes a Title Case featured creators landmark', () => {
    render(
      <FeaturedArtistsSection
        creators={[
          {
            id: '1',
            handle: 'example-artist',
            name: 'Example Artist',
            src: '/apple-touch-icon.png',
          },
        ]}
      />
    );

    expect(
      screen.getByRole('region', { name: 'Featured Creators' })
    ).toBeInTheDocument();
  });
});
