import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EntityCarousel } from './EntityCarousel';
import type { EntityCardModel } from './types';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
    readonly [key: string]: unknown;
  }) => React.createElement('a', { href, ...props }, children),
}));

vi.mock('@/components/atoms/ImageWithFallback', () => ({
  ImageWithFallback: ({
    alt,
    src,
  }: {
    readonly alt: string;
    readonly src: string;
  }) => React.createElement('img', { alt, src }),
}));

const releaseCard: EntityCardModel = {
  id: 'release-1',
  kind: 'music',
  href: '/tim/release-1',
  imageUrl: 'https://cdn.test/art.jpg',
  imageAlt: 'The Deep End',
  title: 'The Deep End',
  cta: { label: 'Listen', href: '/tim/release-1' },
};

const merchCard: EntityCardModel = {
  id: 'merch-1',
  kind: 'merch',
  href: '/tim/merch/merch-1',
  imageUrl: 'https://cdn.test/tee.jpg',
  imageAlt: 'Tour Tee',
  title: 'Tour Tee',
  cta: { label: 'Buy', href: '/tim/merch/merch-1' },
};

describe('EntityCarousel', () => {
  it('constrains the track width so wide cards scroll inside the rail', () => {
    render(<EntityCarousel items={[releaseCard, merchCard]} />);

    const track = screen.getByTestId('entity-carousel');
    expect(track).toHaveClass('w-full');
    expect(track).toHaveClass('min-w-0');
    expect(track).toHaveClass('max-w-full');
    expect(track).toHaveClass('overflow-x-auto');
  });
});
