import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PricingSection } from '@/features/home/PricingSection';

describe('PricingSection', () => {
  it('renders the pricing heading with canonical Title Case (JOV-3473)', () => {
    render(<PricingSection />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Simple Pricing.');
    expect(heading.textContent?.trim()).toBe('Simple Pricing.');
  });
});
