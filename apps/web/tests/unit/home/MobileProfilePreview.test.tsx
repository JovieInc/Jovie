import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MobileProfilePreview } from '@/components/home/MobileProfilePreview';
import type { FeaturedCreator } from '@/lib/featured-creators';

const creator: FeaturedCreator = {
  id: 'creator-1',
  handle: 'timwhitemusic',
  name: 'Tim White',
  src: '/avatar.png',
  genres: ['Indie', 'Alternative'],
  latestReleaseTitle: 'Never Say A Word',
  latestReleaseType: 'single',
};

describe('MobileProfilePreview', () => {
  it('renders creator data from featured creator payload', () => {
    render(<MobileProfilePreview creator={creator} />);

    expect(screen.getByText('Tim White')).toBeInTheDocument();
    expect(screen.getByText('Indie · Alternative')).toBeInTheDocument();
    expect(screen.getByText('Never Say A Word')).toBeInTheDocument();
    expect(screen.getByText('Single')).toBeInTheDocument();
    expect(screen.getByText('Get updates from Tim')).toBeInTheDocument();
  });

  it('falls back gracefully when release and genres are missing', () => {
    render(
      <MobileProfilePreview
        creator={{
          ...creator,
          genres: [],
          latestReleaseTitle: null,
          latestReleaseType: null,
        }}
      />
    );

    expect(screen.getByText('Independent artist')).toBeInTheDocument();
    expect(screen.getByText('New release coming soon')).toBeInTheDocument();
    expect(screen.getByText('Latest release')).toBeInTheDocument();
  });
});
