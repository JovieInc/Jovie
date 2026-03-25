import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

describe('BrandLogo', () => {
  it('renders a single svg element (not an image)', () => {
    const { container } = render(<BrandLogo />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
  });

  it('renders with default aria-label "Jovie"', () => {
    render(<BrandLogo />);
    expect(screen.getByLabelText('Jovie')).toBeInTheDocument();
  });

  it('renders with custom alt text as aria-label', () => {
    render(<BrandLogo alt='Custom Logo' />);
    expect(screen.getByLabelText('Custom Logo')).toBeInTheDocument();
  });

  it('renders auto tone with no inline color style', () => {
    const { container } = render(<BrandLogo tone='auto' />);
    const svg = container.querySelector('svg');
    expect(svg).not.toHaveStyle({ color: '#fff' });
    expect(svg).not.toHaveStyle({ color: '#635aff' });
  });

  it('renders white tone with white color', () => {
    const { container } = render(<BrandLogo tone='white' />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveStyle({ color: '#fff' });
  });

  it('renders color tone with brand purple', () => {
    const { container } = render(<BrandLogo tone='color' />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveStyle({ color: '#635aff' });
  });

  it('renders muted tone with muted class', () => {
    const { container } = render(<BrandLogo tone='muted' />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('text-muted-foreground/50');
  });

  it('applies size to width and height attributes', () => {
    const { container } = render(<BrandLogo size={64} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '64');
    expect(svg).toHaveAttribute('height', '64');
  });

  it('uses default size of 48', () => {
    const { container } = render(<BrandLogo />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '48');
    expect(svg).toHaveAttribute('height', '48');
  });

  it('applies rounded-full class when rounded=true (default)', () => {
    const { container } = render(<BrandLogo />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('rounded-full');
  });

  it('does not apply rounded-full class when rounded=false', () => {
    const { container } = render(<BrandLogo rounded={false} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toHaveClass('rounded-full');
  });

  it('applies custom className', () => {
    const { container } = render(<BrandLogo className='my-logo' />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('my-logo');
  });

  it('applies aria-hidden attribute', () => {
    const { container } = render(<BrandLogo aria-hidden />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('has fill="currentColor" for CSS color inheritance', () => {
    const { container } = render(<BrandLogo />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('fill', 'currentColor');
  });

  it('passes a11y checks', async () => {
    const { container } = render(<BrandLogo />);
    await expectNoA11yViolations(container);
  });
});
