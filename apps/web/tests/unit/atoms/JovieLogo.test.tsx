import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JovieLogo } from '@/components/atoms/JovieLogo';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => (
    <img src={src} alt={alt} {...props} />
  ),
}));

describe('JovieLogo', () => {
  it('renders as an anchor link when href provided', () => {
    render(<JovieLogo href='/home' />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/home');
  });

  it('renders with computed aria-label for home (default)', () => {
    render(<JovieLogo />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('aria-label', 'Jovie home');
  });

  it('renders with computed aria-label for artist profile', () => {
    render(<JovieLogo artistHandle='testartist' />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute(
      'aria-label',
      'Create your own profile with Jovie'
    );
  });

  it('renders with custom ariaLabel prop', () => {
    render(<JovieLogo ariaLabel='Go to dashboard' />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('aria-label', 'Go to dashboard');
  });

  it('renders dark variant class when variant="dark"', () => {
    render(<JovieLogo variant='dark' />);
    const svg = document.querySelector('svg');
    expect(svg).toHaveClass('text-white');
  });

  it('renders showText content when showText=true', () => {
    render(<JovieLogo showText />);
    expect(screen.getByText('Jovie')).toBeInTheDocument();
  });

  it('renders sm size class when size="sm"', () => {
    render(<JovieLogo size='sm' />);
    const svg = document.querySelector('svg');
    expect(svg).toHaveClass('h-4');
  });

  it('has no a11y violations', async () => {
    const { container } = render(<JovieLogo />);
    await expectNoA11yViolations(container);
  });
});
