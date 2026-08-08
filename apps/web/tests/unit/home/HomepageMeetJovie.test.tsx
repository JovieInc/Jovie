import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  type HomepageArtistProfileCards,
  HomepageArtistProfiles,
} from '@/components/homepage/HomepageArtistProfiles';
import { HomepageMeetJovie } from '@/components/homepage/HomepageMeetJovie';

const CARDS: HomepageArtistProfileCards = [
  {
    id: 'sell-out',
    title: 'Sell Out',
    body: 'Put your next show where fans can get tickets.',
    image: {
      publicUrl: '/artist-streams.png',
      width: 660,
      height: 1368,
      alt: 'Jovie artist profile focused on streaming music',
    },
  },
  {
    id: 'capture-fans',
    title: 'Capture Fans',
    body: 'Build a list you can use again.',
    image: {
      publicUrl: '/artist-fans.png',
      width: 660,
      height: 1368,
      alt: 'Jovie artist profile focused on capturing fans',
    },
  },
  {
    id: 'get-paid',
    title: 'Get Paid',
    body: 'Make direct support feel native.',
    image: {
      publicUrl: '/artist-pay.png',
      width: 660,
      height: 1368,
      alt: 'Jovie artist profile focused on artist payments',
    },
  },
  {
    id: 'drop-music',
    title: 'Drop Music',
    body: 'Give fans one link for the release before it lands.',
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
  it('moves all three profile outcomes into Artist Profiles', () => {
    render(<HomepageArtistProfiles cards={CARDS} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Artist Profiles' })
    ).toBeInTheDocument();
    expect(screen.getByText('Built to convert')).toHaveClass(
      'homepage-artist-profiles__intro'
    );
    expect(
      screen.getByRole('tablist', { name: 'Artist Profile outcomes' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Sell Out');
  });

  it('preserves registry-backed image geometry with accessible carousel controls', () => {
    render(<HomepageArtistProfiles cards={CARDS} />);

    expect(
      screen.getByRole('link', { name: 'Explore Artist Profiles' })
    ).toHaveAttribute('href', '/artist-profiles');
    expect(
      screen.getByRole('link', { name: 'Explore Artist Profiles' })
    ).not.toHaveClass('bg-white');

    const selected = screen.getByRole('tab', { name: 'Sell Out' });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(selected).toHaveAttribute('data-variant', 'ghost');
    expect(selected).toHaveAttribute('data-size', 'sm');

    const image = screen.getByRole('img');
    expect(image.getAttribute('src')).toContain(
      encodeURIComponent(CARDS[0].image.publicUrl)
    );
    expect(image).toHaveAttribute('alt', CARDS[0].image.alt);
    expect(image).toHaveAttribute('width', String(CARDS[0].image.width));
    expect(image).toHaveAttribute('height', String(CARDS[0].image.height));
  });

  it('makes each outcome an explicit selectable preview', () => {
    render(<HomepageArtistProfiles cards={CARDS} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Get Paid' }));

    expect(screen.getByRole('tab', { name: 'Get Paid' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Get Paid');
    expect(screen.getByRole('img')).toHaveAttribute('alt', CARDS[2].image.alt);
  });
});
