import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FinalCTASection } from '@/components/home/FinalCTASection';

describe('FinalCTASection', () => {
  it('renders urgency headline', () => {
    render(<FinalCTASection />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Claim your piece of the internet.'
    );
  });

  it('renders CTA button', () => {
    render(<FinalCTASection />);
    expect(
      screen.getByRole('link', { name: /get started/i })
    ).toBeInTheDocument();
  });

  it('renders subtext', () => {
    render(<FinalCTASection />);
    expect(screen.getByText(/no credit card required/i)).toBeInTheDocument();
  });
});
