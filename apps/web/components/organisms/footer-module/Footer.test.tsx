import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { Footer } from './Footer';

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

describe('Footer', () => {
  it('keeps regular footer destinations on the shared route registry', () => {
    render(<Footer variant='regular' />);

    const expectedLinks = {
      'Artist Profiles': APP_ROUTES.ARTIST_PROFILES,
      Pricing: APP_ROUTES.PRICING,
      Support: APP_ROUTES.SUPPORT,
      Blog: APP_ROUTES.BLOG,
      Changelog: APP_ROUTES.CHANGELOG,
    } as const;

    for (const [label, href] of Object.entries(expectedLinks)) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute(
        'href',
        href
      );
    }

    for (const label of ['Privacy', 'Terms']) {
      for (const link of screen.getAllByRole('link', { name: label })) {
        expect(link).toHaveAttribute(
          'href',
          label === 'Privacy'
            ? APP_ROUTES.LEGAL_PRIVACY
            : APP_ROUTES.LEGAL_TERMS
        );
      }
    }
  });
});
