import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  type HomepageArtistOutcomeCards,
  HomepageArtistOutcomes,
} from '@/components/homepage/HomepageArtistOutcomes';

const CARDS: HomepageArtistOutcomeCards = [
  {
    id: 'drive-streams',
    title: 'Drive Streams',
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
    image: {
      publicUrl: '/artist-pay.png',
      width: 660,
      height: 1368,
      alt: 'Jovie artist profile focused on artist payments',
    },
  },
];

describe('HomepageArtistOutcomes', () => {
  it('renders exactly three static artist outcomes with semantic headings', () => {
    render(<HomepageArtistOutcomes cards={CARDS} />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Every Fan Has A Next Move.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Artist Outcomes' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);

    for (const title of ['Drive Streams', 'Capture Fans', 'Get Paid']) {
      expect(
        screen.getByRole('heading', { level: 3, name: title })
      ).toBeInTheDocument();
    }
  });

  it('preserves registry-backed image geometry and has no carousel controls', () => {
    render(<HomepageArtistOutcomes cards={CARDS} />);

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
      expect(images[index]).toHaveAttribute(
        'sizes',
        '(min-width: 1360px) 390px, (min-width: 768px) 30vw, calc(100vw - 3rem)'
      );
    }

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
