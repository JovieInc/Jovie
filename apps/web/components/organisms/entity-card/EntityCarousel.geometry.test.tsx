import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EntityCarousel } from './EntityCarousel';
import type { EntityCardModel } from './types';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
    readonly prefetch?: boolean;
    readonly [key: string]: unknown;
  }) => React.createElement('a', { href, ...props }, children),
}));

vi.mock('@/components/atoms/ImageWithFallback', () => ({
  ImageWithFallback: ({
    alt,
    className,
    src,
  }: {
    readonly alt: string;
    readonly className?: string;
    readonly src: string;
  }) => React.createElement('img', { alt, className, src }),
}));

const items: EntityCardModel[] = [
  {
    id: 'release-1',
    kind: 'music',
    href: '/tim/release-1',
    imageUrl: '/release-1.jpg',
    imageAlt: 'Release one',
    title: 'Release One',
  },
  {
    id: 'release-2',
    kind: 'music',
    href: '/tim/release-2',
    imageUrl: '/release-2.jpg',
    imageAlt: 'Release two',
    title: 'Release Two',
  },
];

describe('EntityCarousel profile geometry', () => {
  it('fills the track height and uses the shared aspect-ratio card geometry', () => {
    render(<EntityCarousel items={items} dataTestId='profile-home-carousel' />);

    const carousel = screen.getByTestId('profile-home-carousel');
    expect(carousel.className).toContain('overflow-x-auto');
    expect(carousel.className).toContain('overflow-y-hidden');
    expect(carousel.className).toContain('profile-horizontal-rail');
    expect(carousel.className).toContain('h-full');
    expect(carousel.className).toContain('items-stretch');
    expect(carousel.className).toContain('snap-mandatory');
    expect(carousel.className).toContain('overscroll-x-contain');
    expect(carousel.className).not.toContain('touch-action');

    const footprints = [...carousel.querySelectorAll(':scope > li')];
    expect(footprints).toHaveLength(2);
    // One stable geometry for every card: the .profile-entity-card class owns
    // aspect-ratio/height/cap in design-system.css — no fixed px footprints.
    expect(
      footprints.every(
        item =>
          item.className.includes('profile-entity-card') &&
          item.className.includes('snap-always') &&
          !item.className.includes('w-56') &&
          !item.className.includes('h-96')
      )
    ).toBe(true);

    for (const card of screen.getAllByTestId('entity-card-music')) {
      expect(card.className).toContain('h-full');
      expect(card.className).toContain('overflow-hidden');
      expect(card.className).not.toContain('aspect-card-standard');
    }
  });

  it('flexes the art zone inside the height-locked card without cropping artwork', () => {
    render(<EntityCarousel items={items} />);

    for (const image of screen.getAllByRole('img')) {
      // Height-locked 3:4 cards: the art zone flexes to fill whatever the
      // content zone leaves (a fixed square would push the CTA out), and
      // release artwork is fitted (object-contain), never cropped.
      expect(image.parentElement?.className).toContain('flex-1');
      expect(image.parentElement?.className).not.toContain('aspect-square');
      expect(image.className).toContain('object-contain');
    }
  });

  it('renders leading and trailing slot cards in the same geometry', () => {
    render(
      <EntityCarousel
        items={items}
        dataTestId='profile-home-carousel'
        leading={<section data-testid='slot-leading' />}
        trailing={<section data-testid='slot-trailing' />}
      />
    );

    const carousel = screen.getByTestId('profile-home-carousel');
    const footprints = [...carousel.querySelectorAll(':scope > li')];
    expect(footprints).toHaveLength(4);

    const leadingLi = carousel.querySelector('[data-carousel-slot="leading"]');
    const trailingLi = carousel.querySelector(
      '[data-carousel-slot="trailing"]'
    );
    expect(leadingLi?.className).toContain('profile-entity-card');
    expect(trailingLi?.className).toContain('profile-entity-card');
    // Leading slot is the first card, trailing slot the last.
    expect(footprints[0]).toBe(leadingLi);
    expect(footprints[footprints.length - 1]).toBe(trailingLi);
    expect(leadingLi?.contains(screen.getByTestId('slot-leading'))).toBe(true);
    expect(trailingLi?.contains(screen.getByTestId('slot-trailing'))).toBe(
      true
    );
  });

  it('renders slot-only carousels (no entity items) without an empty shell', () => {
    render(
      <EntityCarousel
        items={[]}
        dataTestId='profile-home-carousel'
        leading={<section data-testid='slot-leading' />}
      />
    );

    const carousel = screen.getByTestId('profile-home-carousel');
    expect(carousel.querySelectorAll(':scope > li')).toHaveLength(1);
  });
});
