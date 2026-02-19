import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

// Mock next/link
type NextLinkProps = ComponentProps<'a'> & { href: string };
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: NextLinkProps) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { FinalCTASection } from '@/components/home/FinalCTASection';

describe('FinalCTASection', () => {
  it('renders heading text', () => {
    render(<FinalCTASection />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Your fans are waiting.'
    );
  });

  it('renders subtitle text', () => {
    render(<FinalCTASection />);
    expect(screen.getByText(/connect spotify/i)).toBeInTheDocument();
  });

  it('renders CTA button linking to signup', () => {
    render(<FinalCTASection />);
    const link = screen.getByRole('link', { name: /get started free/i });
    expect(link).toHaveAttribute('href', '/signup');
  });
});
