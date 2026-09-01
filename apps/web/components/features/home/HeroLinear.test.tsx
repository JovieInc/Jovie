import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HeroLinear } from './HeroLinear';

interface MockImageProps {
  readonly alt: string;
}

interface MockLinkProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly href: string;
}

vi.mock('next/image', () => ({
  default: ({ alt }: MockImageProps) => <img alt={alt} />,
}));

vi.mock('next/link', () => ({
  default: ({ children, className, href }: MockLinkProps) => (
    <a className={className} href={href}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/screenshots/registry', () => ({
  getMarketingExportImage: () => ({ publicUrl: '/mock-dashboard.png' }),
}));

describe('HeroLinear', () => {
  it('renders bounded hero copy, primary CTA, and dashboard image receipt', () => {
    render(<HeroLinear />);

    const shell = screen.getByTestId('homepage-shell');
    const heading = screen.getByRole('heading', {
      level: 1,
      name: /Drop More Music\.\s+Crush Every Release\./,
    });
    const primaryLink = screen.getByRole('link', { name: 'Request Access' });

    expect(shell).toHaveAttribute('aria-labelledby', 'hero-heading');
    expect(heading).toHaveClass('marketing-h1-linear', 'line-clamp-2');
    expect(primaryLink).toHaveClass('public-action-primary');
    expect(
      screen.getByRole('img', {
        name: /Jovie releases dashboard showing smart links/i,
      })
    ).toBeInTheDocument();
  });
});
