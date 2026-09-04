import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FeaturedCreator } from '@/lib/featured-creators';
import { HomeLiveProofSection } from './HomeLiveProofSection';

vi.mock('next/image', () => ({
  default: ({ alt }: { readonly alt: string }) => <img alt={alt} />,
}));

const creators: readonly FeaturedCreator[] = [
  {
    id: 'featured',
    handle: 'ari',
    name: 'Ari',
    src: '/ari.jpg',
    tagline: 'Synth songwriter',
    genres: ['pop'],
    latestReleaseTitle: 'Night Signal',
    latestReleaseType: 'EP',
  },
  {
    id: 'supporting-1',
    handle: 'sol',
    name: 'Sol',
    src: '/sol.jpg',
    tagline: 'Touring DJ',
    genres: ['pop'],
    latestReleaseTitle: null,
    latestReleaseType: null,
  },
  {
    id: 'supporting-2',
    handle: 'kai',
    name: 'Kai',
    src: '/kai.jpg',
    tagline: null,
    genres: ['pop'],
    latestReleaseTitle: null,
    latestReleaseType: null,
  },
];

describe('HomeLiveProofSection', () => {
  it('renders bounded live proof cards with supporting lines', () => {
    render(<HomeLiveProofSection creators={creators} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'See it live.' })
    ).toHaveClass('line-clamp-2');
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.getByText(/Night Signal/)).toBeInTheDocument();
    expect(screen.getByText('Touring DJ')).toBeInTheDocument();
    expect(screen.getByAltText('Ari profile photo')).toBeInTheDocument();
  });
});
