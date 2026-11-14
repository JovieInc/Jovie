import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PayPromo from '@/components/organisms/PayPromo';

describe('PayPromo', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  it('renders with no environment switch set', () => {
    render(<PayPromo />);

    // Check main heading with emphasis
    expect(screen.getByText('Pay,')).toBeInTheDocument();
    expect(screen.getByText('instantly.')).toBeInTheDocument();

    // Check description text
    expect(screen.getByText(/Fans tap once, you get paid/)).toBeInTheDocument();
    expect(screen.getByText(/No sign-ups, no fees/)).toBeInTheDocument();
    expect(
      screen.getByText(/just pure support—directly in Venmo/)
    ).toBeInTheDocument();

    // Check CTA button
    const ctaButton = screen.getByRole('link', { name: 'See it live' });
    expect(ctaButton).toBeInTheDocument();
    expect(ctaButton).toHaveAttribute('href', '/tim/pay');
  });

  it('has correct styling classes when rendered', () => {
    render(<PayPromo />);

    // Check section has surface-0 background and primary-token text (shell-v1 tokens)
    const section = screen.getByText('Pay,').closest('section');
    expect(section).toHaveClass('bg-surface-0', 'text-primary-token');

    // Check CTA button styling - CTAButton uses the shared secondary token set.
    const ctaButton = screen.getByRole('link', { name: 'See it live' });
    expect(ctaButton).toHaveClass('bg-btn-secondary');
    expect(ctaButton).toHaveClass('hover:bg-(--color-btn-secondary-hover)');
  });

  it('contains "Pay, instantly." heading when feature flag is enabled', () => {
    render(<PayPromo />);

    // This specifically tests the requirement from the problem statement
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Pay, instantly.');
  });

  it('has responsive design classes', () => {
    render(<PayPromo />);

    // Check responsive text sizing - SectionHeading with size="xl" has these classes
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveClass('text-3xl', 'md:text-4xl', 'sm:text-5xl');

    // Check responsive paragraph sizing
    const paragraph = screen.getByText(/Fans tap once, you get paid/);
    expect(paragraph).toHaveClass('text-lg', 'sm:text-xl');
  });

  it('has the correct link destination', () => {
    render(<PayPromo />);

    const ctaButton = screen.getByRole('link', { name: 'See it live' });
    expect(ctaButton).toHaveAttribute('href', '/tim/pay');
  });
});
