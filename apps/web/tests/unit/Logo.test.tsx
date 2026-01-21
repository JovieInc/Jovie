import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from '@/components/atoms/Logo';

describe('Logo', () => {
  it('renders the logo SVG', () => {
    render(<Logo />);

    const logo = screen.getByLabelText('Jovie logo');
    expect(logo).toBeInTheDocument();
    expect(logo.tagName.toLowerCase()).toBe('svg');
  });

  it('has correct default attributes', () => {
    render(<Logo />);

    const logo = screen.getByLabelText('Jovie logo');
    expect(logo).toHaveAttribute('viewBox', '0 0 136 39');
    expect(logo).toHaveAttribute('fill', 'currentColor');
  });

  it('applies default medium size class', () => {
    render(<Logo />);

    const logo = screen.getByLabelText('Jovie logo');
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

      const logo = screen.getByLabelText('Jovie logo');
      expect(logo).toHaveClass(expectedClass, 'w-auto');

      unmount();
    });
  });

  it('applies custom className while preserving default classes', () => {
    const customClass = 'custom-logo-class';
    render(<Logo className={customClass} />);

    const logo = screen.getByLabelText('Jovie logo');
    expect(logo).toHaveClass(customClass);
    expect(logo).toHaveClass('h-8', 'w-auto'); // Should still have default size
    expect(logo).toHaveClass('text-black', 'dark:text-white'); // Should still have theme colors
  });

  it('includes color transition classes', () => {
    render(<Logo />);

    const logo = screen.getByLabelText('Jovie logo');
    expect(logo).toHaveClass(
      'text-black',
      'dark:text-white',
      'transition-colors',
      'duration-200'
    );
  });

  it('contains the Jovie logo path data', () => {
    render(<Logo />);

    const logo = screen.getByLabelText('Jovie logo');
    const path = logo.querySelector('path');
    expect(path).toBeInTheDocument();
    expect(path).toHaveAttribute('fill-rule', 'evenodd');
    expect(path).toHaveAttribute('d');

    // Verify it has a substantial path (the Jovie logo)
    const pathData = path?.getAttribute('d');
    expect(pathData).toBeTruthy();
    expect(pathData!.length).toBeGreaterThan(100); // Ensure it's not empty or minimal
  });

  it('has proper xmlns attributes for SVG', () => {
    render(<Logo />);

    const logo = screen.getByLabelText('Jovie logo');
    expect(logo).toHaveAttribute('xmlns', 'http://www.w3.org/2000/svg');
    expect(logo).toHaveAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  });
});
