import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  HomepageMeetJovie,
  type HomepageMeetJovieCards,
} from '@/components/homepage/HomepageMeetJovie';

const CARDS: HomepageMeetJovieCards = [
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

describe('HomepageMeetJovie', () => {
  it('renders the Meet Jovie intro and all three outcome cards', () => {
    render(<HomepageMeetJovie cards={CARDS} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Meet Jovie' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/AI artist workspace that surfaces opportunities/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Outcomes Jovie Delivers' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);

    for (const title of ['Drive Streams', 'Capture Fans', 'Get Paid']) {
      expect(
        screen.getByRole('heading', { level: 3, name: title })
      ).toBeInTheDocument();
    }
  });

  it('renders carousel controls and preserves registry-backed image geometry', () => {
    render(<HomepageMeetJovie cards={CARDS} />);

    expect(
      screen.getByRole('button', { name: 'Previous Outcomes' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Next Outcomes' })
    ).toBeInTheDocument();

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
