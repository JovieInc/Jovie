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
  it('uses one horizontal-only scroll owner and equal card footprints', () => {
    render(<EntityCarousel items={items} dataTestId='profile-home-carousel' />);

    const carousel = screen.getByTestId('profile-home-carousel');
    expect(carousel.className).toContain('overflow-x-auto');
    expect(carousel.className).toContain('overflow-y-hidden');
    expect(carousel.className).toContain('profile-horizontal-rail');
    expect(carousel.className).not.toContain('touch-action');

    const footprints = [...carousel.querySelectorAll(':scope > li')];
    expect(footprints).toHaveLength(2);
    expect(
      footprints.every(
        item =>
          item.className.includes('w-56') && item.className.includes('h-96')
      )
    ).toBe(true);

    for (const card of screen.getAllByTestId('entity-card-music')) {
      expect(card.className).toContain('h-full');
      expect(card.className).toContain('overflow-hidden');
      expect(card.className).not.toContain('aspect-card-standard');
    }
  });

  it('keeps release artwork square and fits it without cropping', () => {
    render(<EntityCarousel items={items} />);

    for (const image of screen.getAllByRole('img')) {
      expect(image.parentElement?.className).toContain('aspect-square');
      expect(image.className).toContain('object-contain');
    }
  });
});
