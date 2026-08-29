import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  type HomepageArtistProfilePreviews,
  HomepageArtistProfiles,
} from '@/components/homepage/HomepageArtistProfiles';
import { HomepageMeetJovie } from '@/components/homepage/HomepageMeetJovie';

const PREVIEWS: HomepageArtistProfilePreviews = [
  {
    id: 'tour',
    label: 'Tour',
    image: {
      publicUrl: '/artist-streams.png',
      width: 660,
      height: 1368,
      alt: 'Jovie artist profile focused on streaming music',
    },
  },
  {
    id: 'subscribe',
    label: 'Subscribe',
    image: {
      publicUrl: '/artist-fans.png',
      width: 660,
      height: 1368,
      alt: 'Jovie artist profile focused on capturing fans',
    },
  },
  {
    id: 'pay',
    label: 'Pay',
    image: {
      publicUrl: '/artist-pay.png',
      width: 660,
      height: 1368,
      alt: 'Jovie artist profile focused on artist payments',
    },
  },
  {
    id: 'presave',
    label: 'Presave',
    image: {
      publicUrl: '/artist-presave.png',
      width: 660,
      height: 1368,
      alt: 'Jovie artist profile focused on an upcoming release',
    },
  },
];

describe('HomepageMeetJovie', () => {
  it('renders a compact text-only brand thesis', () => {
    const { container } = render(<HomepageMeetJovie />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Jovie is the AI workspace for artists. Built around your artist presence.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Jovie is the AI workspace for artists.')
    ).toHaveClass('homepage-meet-jovie__heading-primary');
    expect(screen.getByText('Built around your artist presence.')).toHaveClass(
      'homepage-meet-jovie__heading-secondary'
    );
    expect(screen.queryByText('Meet Jovie')).not.toBeInTheDocument();
    expect(container.querySelectorAll('img, ul, button')).toHaveLength(0);
  });
});

describe('HomepageArtistProfiles', () => {
  it('renders the four registry product states without synthetic outcome copy', () => {
    render(<HomepageArtistProfiles previews={PREVIEWS} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Artist Profiles' })
    ).toBeInTheDocument();
    expect(screen.getByText('Built to convert')).toHaveClass(
      'homepage-artist-profiles__intro'
    );
    expect(
      screen.getByRole('list', { name: 'Jovie Artist Profile Previews' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);

    for (const label of ['Tour', 'Subscribe', 'Pay', 'Presave']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
    expect(screen.queryByText('Sell Out')).toBeNull();
    expect(screen.queryByText('Capture Fans')).toBeNull();
    expect(screen.queryByText('Get Paid')).toBeNull();
    expect(screen.queryByText('Drop Music')).toBeNull();
  });

  it('preserves registry-backed image geometry with accessible carousel controls', () => {
    render(<HomepageArtistProfiles previews={PREVIEWS} />);

    expect(
      screen.getByRole('link', { name: 'Explore Artist Profiles' })
    ).toHaveAttribute('href', '/artist-profiles');
    expect(
      screen.getByRole('link', { name: 'Explore Artist Profiles' })
    ).not.toHaveClass('bg-white');

    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(4);
    const previous = screen.getByRole('button', {
      name: 'Previous Artist Profile Preview',
    });
    const next = screen.getByRole('button', {
      name: 'Next Artist Profile Preview',
    });

    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();
    expect(previous).toHaveAttribute('data-variant', 'ghost');
    expect(previous).toHaveAttribute('data-size', 'icon');
    expect(next).toHaveAttribute('data-variant', 'ghost');
    expect(next).toHaveAttribute('data-size', 'icon');

    for (const [index, preview] of PREVIEWS.entries()) {
      expect(images[index].getAttribute('src')).toContain(
        encodeURIComponent(preview.image.publicUrl)
      );
      expect(images[index]).toHaveAttribute('alt', preview.image.alt);
      expect(images[index]).toHaveAttribute(
        'width',
        String(preview.image.width)
      );
      expect(images[index]).toHaveAttribute(
        'height',
        String(preview.image.height)
      );
    }
  });
});
