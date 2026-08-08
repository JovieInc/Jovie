import { render, screen } from '@testing-library/react';
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
      screen.getByRole('list', { name: 'Jovie Artist Profile Outcomes' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);

    for (const title of [
      'Sell Out',
      'Capture Fans',
      'Get Paid',
      'Drop Music',
    ]) {
      expect(
        screen.getByRole('heading', { level: 3, name: title })
      ).toBeInTheDocument();
    }

    for (const body of CARDS.map(card => card.body)) {
      expect(screen.getByText(body)).toBeInTheDocument();
    }
  });

  it('preserves registry-backed image geometry with accessible carousel controls', () => {
    render(<HomepageArtistProfiles cards={CARDS} />);

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

    for (const [index, card] of CARDS.entries()) {
      expect(images[index].getAttribute('src')).toContain(
        encodeURIComponent(card.image.publicUrl)
      );
      expect(images[index]).toHaveAttribute('alt', card.image.alt);
      expect(images[index]).toHaveAttribute('width', String(card.image.width));
      expect(images[index]).toHaveAttribute(
        'height',
        String(card.image.height)
      );
    }
  });
});
