import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  type HomepageArtistProfileCards,
  HomepageArtistProfiles,
} from '@/components/homepage/HomepageArtistProfiles';
import { HomepageMeetJovie } from '@/components/homepage/HomepageMeetJovie';

const CARDS: HomepageArtistProfileCards = [
  {
    id: 'drive-streams',
    title: 'Drive Streams',
    body: 'Put the latest release first.',
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
];

describe('HomepageMeetJovie', () => {
  it('renders a compact text-only brand thesis', () => {
    const { container } = render(<HomepageMeetJovie />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Jovie is the AI workspace for artists. Built around your catalog, audience, and artist presence.',
      })
    ).toBeInTheDocument();
    expect(screen.getByText('Meet Jovie')).toHaveClass(
      'homepage-meet-jovie__eyebrow'
    );
    expect(
      screen.getByText(
        'Built around your catalog, audience, and artist presence.'
      )
    ).toBeInTheDocument();
    expect(container.querySelectorAll('img, ul, button')).toHaveLength(0);
  });
});

describe('HomepageArtistProfiles', () => {
  it('moves all three profile outcomes into Artist Profiles', () => {
    render(<HomepageArtistProfiles cards={CARDS} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Artist Profiles' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Jovie Artist Profile Outcomes' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);

    for (const title of ['Drive Streams', 'Capture Fans', 'Get Paid']) {
      expect(
        screen.getByRole('heading', { level: 3, name: title })
      ).toBeInTheDocument();
    }

    for (const body of CARDS.map(card => card.body)) {
      expect(screen.getByText(body)).toBeInTheDocument();
    }
  });

  it('preserves registry-backed image geometry without carousel controls', () => {
    render(<HomepageArtistProfiles cards={CARDS} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(3);

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
