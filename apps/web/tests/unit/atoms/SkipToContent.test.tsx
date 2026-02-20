import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SkipToContent } from '@/components/atoms/SkipToContent';

describe('SkipToContent', () => {
  it('renders with correct default href', () => {
    render(<SkipToContent />);
    const link = screen.getByRole('link', { name: 'Skip to content' });
    expect(link).toHaveAttribute('href', '#main-content');
  });

  it('renders with custom targetId', () => {
    render(<SkipToContent targetId='custom-target' />);
    const link = screen.getByRole('link', { name: 'Skip to content' });
    expect(link).toHaveAttribute('href', '#custom-target');
  });

  it('renders with custom linkText', () => {
    render(<SkipToContent linkText='Jump to main' />);
    const link = screen.getByRole('link', { name: 'Jump to main' });
    expect(link).toBeInTheDocument();
  });

  it('renders with both custom props', () => {
    render(
      <SkipToContent targetId='content-area' linkText='Skip navigation' />
    );
    const link = screen.getByRole('link', { name: 'Skip navigation' });
    expect(link).toHaveAttribute('href', '#content-area');
  });

  it('uses sr-only class by default (visually hidden)', () => {
    render(<SkipToContent />);
    const link = screen.getByRole('link', { name: 'Skip to content' });
    expect(link).toHaveClass('sr-only');
  });

  it('has focus:not-sr-only class for visibility on focus', () => {
    render(<SkipToContent />);
    const link = screen.getByRole('link', { name: 'Skip to content' });
    expect(link).toHaveClass('focus:not-sr-only');
  });

  it('has appropriate focus styling classes', () => {
    render(<SkipToContent />);
    const link = screen.getByRole('link', { name: 'Skip to content' });

    // Verify key focus styling classes for visibility
    expect(link).toHaveClass('focus:fixed');
    expect(link).toHaveClass('focus:left-4');
    expect(link).toHaveClass('focus:top-4');
    expect(link).toHaveClass('focus:z-50');
  });

  it('applies custom className', () => {
    render(<SkipToContent className='custom-class' />);
    const link = screen.getByRole('link', { name: 'Skip to content' });
    expect(link).toHaveClass('custom-class');
  });

  it('renders as an anchor element', () => {
    render(<SkipToContent />);
    const link = screen.getByRole('link', { name: 'Skip to content' });
    expect(link.tagName).toBe('A');
  });
});
