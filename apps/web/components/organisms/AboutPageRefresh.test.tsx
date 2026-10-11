import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AboutPageContent } from './AboutPageContent';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  page: vi.fn(),
}));

vi.mock('@/lib/flags/marketing-static', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/flags/marketing-static')>();
  return {
    ...actual,
    FEATURE_FLAGS: {
      ...actual.FEATURE_FLAGS,
      SHOW_PUBLIC_ABOUT_FOOTER_REFRESH: true,
    },
  };
});

describe('AboutPageRefresh', () => {
  it('opens with one company-identity sentence, differentiators, and the recorded team', () => {
    render(<AboutPageContent />);

    expect(screen.getByTestId('about-page-refresh')).toBeVisible();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Jovie is one product for presence, relationships, and growth.',
      })
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Differentiators' })
    ).toBeVisible();
    for (const title of ['Living Profile', 'Relationships', 'Adaptive']) {
      expect(
        screen.getByRole('heading', { level: 3, name: title })
      ).toBeVisible();
    }
    expect(
      screen.queryByRole('heading', { level: 3, name: 'For Artists' })
    ).toBeNull();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Team' })
    ).toBeVisible();
    expect(screen.getByText('Tim White, Founder')).toBeVisible();
    expect(
      screen.getByRole('img', { name: 'Tim White, founder of Jovie' })
    ).toBeVisible();
    expect(screen.queryByText(/TODO: Add team members/)).toBeNull();
  });

  it('does not invent trust, customers, logos, or a stats link', () => {
    render(<AboutPageContent />);

    expect(screen.queryByText(/trusted by/i)).toBeNull();
    expect(screen.queryByRole('heading', { name: /customers/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: /logos/i })).toBeNull();
    const statsLink = screen
      .queryAllByRole('link')
      .find(link => /stats/i.test(link.getAttribute('href') ?? ''));
    expect(statsLink).toBeUndefined();
  });
});
