import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CTASection } from '@/components/organisms/CTASection';

describe('CTASection', () => {
  afterEach(cleanup);

  it('renders the main headline text', () => {
    render(
      <CTASection
        title='Launch your artist page in minutes. Convert visitors into fans.'
        buttonText='Request Early Access →'
        buttonHref='/sign-up'
        variant='primary'
      />
    );

    expect(
      screen.getByText(
        'Launch your artist page in minutes. Convert visitors into fans.'
      )
    ).toBeInTheDocument();
  });

  it('renders the CTA button with correct text', () => {
    render(
      <CTASection
        title='Launch your artist page in minutes. Convert visitors into fans.'
        buttonText='Request Early Access →'
        buttonHref='/sign-up'
        variant='primary'
      />
    );

    expect(
      screen.getByRole('link', { name: /request early access/i })
    ).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(
      <CTASection
        title='Launch your artist page in minutes. Convert visitors into fans.'
        buttonText='Request Early Access →'
        buttonHref='/sign-up'
        variant='primary'
      />
    );

    const section = screen.getByRole('region');
    expect(section).toHaveAttribute('aria-labelledby', 'cta-heading');

    const heading = screen.getByText(
      'Launch your artist page in minutes. Convert visitors into fans.'
    );
    expect(heading).toHaveAttribute('id', 'cta-heading');
  });

  it('applies correct styling classes for emphasis', () => {
    render(
      <CTASection
        title='Launch your artist page in minutes. Convert visitors into fans.'
        buttonText='Request Early Access →'
        buttonHref='/sign-up'
        variant='primary'
      />
    );

    const headline = screen.getByText(
      'Launch your artist page in minutes. Convert visitors into fans.'
    );

    // Check that the headline has bold font weight for strong emphasis
    expect(headline).toHaveClass('font-bold');

    // Check that it has appropriate text sizing and tracking
    expect(headline).toHaveClass('text-xl', 'md:text-2xl', 'tracking-tight');
  });

  it('has proper responsive layout structure', () => {
    render(
      <CTASection
        title='Launch your artist page in minutes. Convert visitors into fans.'
        buttonText='Request Early Access →'
        buttonHref='/sign-up'
        variant='primary'
      />
    );

    const section = screen.getByRole('region');
    expect(section).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /request early access/i });
    expect(link).toHaveAttribute('href', '/sign-up');
  });
});
