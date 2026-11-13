import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EntityCarousel } from './EntityCarousel';
import type { EntityCardModel } from './types';

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

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

describe('EntityCarousel focus ring', () => {
  it('draws every carousel control focus ring from the canonical focus token', () => {
    render(<EntityCarousel items={items} layout='profile-landscape' />);

    const controls = within(
      screen.getByTestId('profile-carousel-controls')
    ).getAllByRole('button');
    // Previous, one dot per card, Next.
    expect(controls.length).toBeGreaterThanOrEqual(3);
    for (const control of controls) {
      expect(control).toHaveClass(
        'focus-visible:ring-2',
        'focus-visible:ring-focus'
      );
      // --focus-ring is defined nowhere; a ring keyed to it has no colour.
      expect(control.className).not.toContain('var(--focus-ring)');
    }
  });
});
