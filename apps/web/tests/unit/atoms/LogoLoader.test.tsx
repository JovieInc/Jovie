import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LogoLoader } from '@/components/atoms/LogoLoader';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

describe('LogoLoader', () => {
  it('renders a polite status output', () => {
    render(<LogoLoader />);
    const status = screen.getByRole('status', { name: 'Loading' });
    expect(status.tagName.toLowerCase()).toBe('output');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('renders with a custom aria-label', () => {
    render(<LogoLoader aria-label='Processing' />);
    expect(
      screen.getByRole('status', { name: 'Processing' })
    ).toBeInTheDocument();
  });

  it('uses the muted brand mark at the default size', () => {
    const { container } = render(<LogoLoader />);
    const mark = container.querySelector('[data-brand-variant="jovie"]');
    const svg = mark?.querySelector('svg');
    expect(mark?.getAttribute('class')).toContain('text-muted-foreground/50');
    expect(mark?.getAttribute('class')).toContain('animate-pulse');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '32');
  });

  it('applies a custom size to the brand mark', () => {
    const { container } = render(<LogoLoader size={48} />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '48');
  });

  it('has no a11y violations', async () => {
    const { container } = render(<LogoLoader />);
    const result = await expectNoA11yViolations(container);
    expect(result).toBeUndefined();
  });
});
