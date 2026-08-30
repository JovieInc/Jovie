import { render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { JovieLogo } from './JovieLogo';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: ReactNode;
    prefetch?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('JovieLogo', () => {
  it('builds a profile invitation link with an accessible label', () => {
    render(<JovieLogo artistHandle='demo-artist' showText />);

    const link = screen.getByRole('link', {
      name: 'Create your own profile with Jovie',
    });
    expect(link).toHaveAttribute(
      'href',
      '/?utm_source=profile&utm_artist=demo-artist'
    );
    expect(screen.getByText('Jovie')).toBeInTheDocument();
  });

  it('renders a static wordmark when the destination is empty', () => {
    render(<JovieLogo href='' title='Jovie wordmark' />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByTitle('Jovie wordmark')).toBeInTheDocument();
  });
});
