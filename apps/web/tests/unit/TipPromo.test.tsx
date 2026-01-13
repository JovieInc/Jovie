import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TipPromo from '@/components/organisms/TipPromo';

describe('TipPromo', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up environment variable mocks
    delete process.env.NEXT_PUBLIC_FEATURE_TIPS;
  });

  it('renders null when NEXT_PUBLIC_FEATURE_TIPS is not "true"', () => {
    // Test with undefined
    delete process.env.NEXT_PUBLIC_FEATURE_TIPS;
    render(<TipPromo />);
    expect(screen.queryByText('Tip, instantly.')).not.toBeInTheDocument();

    // Test with "false"
    process.env.NEXT_PUBLIC_FEATURE_TIPS = 'false';
    render(<TipPromo />);
    expect(screen.queryByText('Tip, instantly.')).not.toBeInTheDocument();

    // Test with empty string
    process.env.NEXT_PUBLIC_FEATURE_TIPS = '';
    render(<TipPromo />);
    expect(screen.queryByText('Tip, instantly.')).not.toBeInTheDocument();
  });

  it('renders the component when NEXT_PUBLIC_FEATURE_TIPS is "true"', () => {
    process.env.NEXT_PUBLIC_FEATURE_TIPS = 'true';

    render(<TipPromo />);

    // Check main heading with emphasis
    expect(screen.getByText('Tip,')).toBeInTheDocument();
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
    expect(ctaButton).toHaveAttribute('href', '/tim/tip');
  });

  it('has correct styling classes when rendered', () => {
    process.env.NEXT_PUBLIC_FEATURE_TIPS = 'true';

    render(<TipPromo />);

    // Check section has dark background and white text
    const section = screen.getByText('Tip,').closest('section');
    expect(section).toHaveClass('bg-zinc-900', 'text-white');

    // Check CTA button styling - now uses CTAButton component classes
    const ctaButton = screen.getByRole('link', { name: 'See it live' });
    expect(ctaButton).toHaveClass('bg-surface-1', 'hover:bg-surface-2');
  });

  it('contains "Tip, instantly." heading when feature flag is enabled', () => {
    process.env.NEXT_PUBLIC_FEATURE_TIPS = 'true';

    render(<TipPromo />);

    // This specifically tests the requirement from the problem statement
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Tip, instantly.');
  });

  it('has responsive design classes', () => {
    process.env.NEXT_PUBLIC_FEATURE_TIPS = 'true';

    render(<TipPromo />);

    // Check responsive text sizing - SectionHeading with size="xl" has these classes
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveClass('text-3xl', 'md:text-4xl', 'sm:text-5xl');

    // Check responsive paragraph sizing
    const paragraph = screen.getByText(/Fans tap once, you get paid/);
    expect(paragraph).toHaveClass('text-lg', 'sm:text-xl');
  });

  it('has the correct link destination', () => {
    process.env.NEXT_PUBLIC_FEATURE_TIPS = 'true';

    render(<TipPromo />);

    const ctaButton = screen.getByRole('link', { name: 'See it live' });
    expect(ctaButton).toHaveAttribute('href', '/tim/tip');
  });
});
