import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from '@/components/atoms/Logo';

describe('Logo', () => {
  it('renders the logo SVG', () => {
    render(<Logo />);

    const logo = screen.getByRole('img', { hidden: true });
    expect(logo).toBeInTheDocument();
    expect(logo.tagName.toLowerCase()).toBe('svg');
  });

  it('has correct default attributes', () => {
    render(<Logo />);

    const logo = screen.getByRole('img', { hidden: true });
    expect(logo.getAttribute('viewBox')).toMatch(/^0 0 \d+ \d+/);
    expect(logo).toHaveAttribute('fill', 'currentColor');
  });

  it('applies default medium size class', () => {
    render(<Logo />);

    const logo = screen.getByRole('img', { hidden: true });
    expect(logo).toHaveClass('h-8', 'w-auto');
  });

  it('applies correct size classes for each size variant', () => {
    const sizes = {
      xs: 'h-4',
      sm: 'h-6',
      md: 'h-8',
      lg: 'h-12',
      xl: 'h-16',
    } as const;

    Object.entries(sizes).forEach(([size, expectedClass]) => {
      const { unmount } = render(<Logo size={size as keyof typeof sizes} />);

      const logo = screen.getByRole('img', { hidden: true });
      expect(logo).toHaveClass(expectedClass, 'w-auto');

      unmount();
    });
  });

  it('applies custom className while preserving default classes', () => {
    const customClass = 'custom-logo-class';
    render(<Logo className={customClass} />);

    const logo = screen.getByRole('img', { hidden: true });
    expect(logo).toHaveClass(customClass);
    expect(logo).toHaveClass('h-8', 'w-auto'); // Should still have default size
    // Color is set via inline style using CSS variable, not Tailwind classes
    expect(logo.style.color).toContain('var(--linear-text-primary');
  });

  it('includes color transition classes', () => {
    render(<Logo />);

    const logo = screen.getByRole('img', { hidden: true });
    expect(logo).toHaveClass('transition-colors', 'duration-subtle');
    // Color is inherited via CSS variable instead of hard-coded theme classes
    expect(logo.style.color).toContain('var(--linear-text-primary');
  });

  it('contains the five construction glyphs', () => {
    render(<Logo />);

    const logo = screen.getByRole('img', { hidden: true });
    expect(logo.querySelectorAll('path')).toHaveLength(5);
    const path = logo.querySelector('path');
    expect(path).toHaveAttribute('d');

    // Verify it has a substantial path (the Jovie logo)
    const pathData = path?.getAttribute('d');
    expect(pathData).toBeTruthy();
    expect(pathData!.length).toBeGreaterThan(100); // Ensure it's not empty or minimal
  });

  it('has proper xmlns attributes for SVG', () => {
    render(<Logo />);

    const logo = screen.getByRole('img', { hidden: true });
    expect(logo).toHaveAttribute('xmlns', 'http://www.w3.org/2000/svg');
  });

  it('names the wordmark for assistive tech', () => {
    render(<Logo />);
    expect(screen.getByLabelText('Jovie logo')).toBeInTheDocument();
  });

  it('renders the icon variant as the brand mark', () => {
    render(<Logo variant='icon' />);
    expect(screen.getByLabelText('Jovie')).toBeInTheDocument();
    expect(screen.queryByLabelText('Jovie logo')).not.toBeInTheDocument();
  });

  it('draws the wordmark alone for the full variants (its o is the mark)', () => {
    render(<Logo variant='full' />);
    expect(screen.getByLabelText('Jovie logo')).toBeInTheDocument();
    expect(screen.queryByLabelText('Jovie')).not.toBeInTheDocument();
  });

  it('draws wordAlt as the same inline wordmark, not raster images', () => {
    const { container } = render(<Logo variant='wordAlt' />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByLabelText('Jovie logo').tagName.toLowerCase()).toBe(
      'svg'
    );
  });
});
