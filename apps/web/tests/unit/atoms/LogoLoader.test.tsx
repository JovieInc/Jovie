import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LogoLoader } from '@/components/atoms/LogoLoader';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('@/components/atoms/BrandLogo', () => ({
  BrandLogo: ({ size, tone, alt, className }: any) => (
    <img
      src='/logo'
      alt={alt}
      data-size={size}
      data-tone={tone}
      className={className}
    />
  ),
}));

describe('LogoLoader', () => {
  it('renders an output element', () => {
    const { container } = render(<LogoLoader />);
    expect(container.querySelector('output')).toBeInTheDocument();
  });

  it('has aria-live="polite" on the output element', () => {
    const { container } = render(<LogoLoader />);
    const output = container.querySelector('output');
    expect(output).toHaveAttribute('aria-live', 'polite');
  });

  it('has default aria-label="Loading"', () => {
    const { container } = render(<LogoLoader />);
    const output = container.querySelector('output');
    expect(output).toHaveAttribute('aria-label', 'Loading');
  });

  it('renders with custom aria-label', () => {
    const { container } = render(<LogoLoader aria-label='Processing' />);
    const output = container.querySelector('output');
    expect(output).toHaveAttribute('aria-label', 'Processing');
  });

  it('uses muted tone for loading context', () => {
    render(<LogoLoader />);
    expect(screen.getByRole('img')).toHaveAttribute('data-tone', 'muted');
  });

  it('uses size 32 by default', () => {
    render(<LogoLoader />);
    expect(screen.getByRole('img')).toHaveAttribute('data-size', '32');
  });

  it('applies animate-pulse class', () => {
    render(<LogoLoader />);
    expect(screen.getByRole('img').className).toContain('animate-pulse');
  });

  it('has no a11y violations', async () => {
    const { container } = render(<LogoLoader />);
    await expectNoA11yViolations(container);
  });
});
