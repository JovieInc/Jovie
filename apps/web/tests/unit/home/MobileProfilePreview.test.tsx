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
    expect(screen.getByText('Indie')).toBeInTheDocument();
    expect(screen.getByText('Turn on Notifications')).toBeInTheDocument();
  });

  it('falls back gracefully when genres are missing', () => {
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

    expect(screen.getByText('Artist')).toBeInTheDocument();
    expect(screen.getByText('Turn on Notifications')).toBeInTheDocument();
  });
});
