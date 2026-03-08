import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CTASection } from '@/components/organisms/CTASection';

const props = {
  title: 'Launch your artist page in minutes. Convert visitors into fans.',
  buttonText: 'Request Early Access →',
  buttonHref: '/sign-up',
  variant: 'primary' as const,
};

describe('CTASection', () => {
  it('renders a labeled region and heading for accessibility', () => {
    render(<CTASection {...props} />);

    const section = screen.getByRole('region');
    expect(section).toHaveAttribute('aria-labelledby', 'cta-heading');

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveAttribute('id', 'cta-heading');
  });

  it('renders a navigable CTA link', () => {
    render(<CTASection {...props} />);

    const link = screen.getByRole('link', { name: /request early access/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/sign-up');
  });
});
