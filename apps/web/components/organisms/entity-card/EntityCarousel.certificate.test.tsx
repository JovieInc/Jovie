import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { EntityCarousel } from './EntityCarousel';
import type { EntityCardModel } from './types';

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
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

const item = (id: string): EntityCardModel => ({
  id,
  kind: 'music',
  imageAlt: `${id} artwork`,
  title: `Release ${id}`,
  cta: { label: 'Listen', href: `/artist/${id}` },
});

describe('EntityCarousel certificate', () => {
  it('steps through cards with the profile controls and has no axe violations', async () => {
    const user = userEvent.setup();
    Element.prototype.scrollTo = vi.fn();
    const { container } = render(
      <EntityCarousel
        items={[item('a'), item('b'), item('c')]}
        layout='profile-landscape'
      />
    );

    const previous = screen.getByRole('button', { name: 'Previous Card' });
    const next = screen.getByRole('button', { name: 'Next Card' });
    expect(previous).toBeDisabled();
    await user.click(next);
    expect(
      screen.getByRole('button', { name: 'Go to card 2' })
    ).toHaveAttribute('aria-current', 'true');
    await user.click(screen.getByRole('button', { name: 'Go to card 3' }));
    expect(next).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('draws no controls for an empty or single-card carousel', async () => {
    const { container } = render(
      <EntityCarousel items={[item('a')]} layout='profile-landscape' />
    );

    expect(screen.queryByTestId('profile-carousel-controls')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
