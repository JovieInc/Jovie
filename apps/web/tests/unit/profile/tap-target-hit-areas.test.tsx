import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EntityMentionText } from '@/components/features/profile/EntityMentionText';
import { FooterBranding } from '@/components/molecules/FooterBranding';
import { Footer } from '@/components/organisms/footer-module/Footer';

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

// jsdom has no layout, so the 44x44pt floor is pinned as a class contract here
// and measured for real by the profile tap-size Playwright assertion.
describe('public profile tap targets (44pt floor)', () => {
  it('gives the Jovie Home logo link a 44pt box', () => {
    render(<FooterBranding artistHandle='tim' variant='linear' size='sm' />);

    const home = screen.getByRole('link', { name: 'Jovie Home' });
    expect(home).toHaveClass('min-h-11', 'min-w-11');
  });

  it('gives every profile legal link a 44pt box', () => {
    render(<Footer variant='profile' artistHandle='tim' />);

    const links = screen
      .getAllByRole('link')
      .filter(link => /^(Privacy|Terms|Report)$/.test(link.textContent ?? ''));
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const link of links) {
      expect(link).toHaveClass('min-h-11', 'min-w-11');
    }
  });

  it('extends inline entity mention links to a 44pt-high hit area', () => {
    render(
      <EntityMentionText
        segments={[
          { type: 'text', text: 'Credits: ' },
          {
            type: 'release',
            text: 'Seaside Heights',
            href: '/tim/seaside-heights',
          } as never,
        ]}
      />
    );

    const mention = screen.getByRole('link', { name: 'Seaside Heights' });
    expect(mention).toHaveClass('relative', 'after:h-11', 'after:absolute');
  });
});
