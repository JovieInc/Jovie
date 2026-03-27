import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TestimonialsSection } from '@/features/home/TestimonialsSection';

describe('TestimonialsSection', () => {
  it('renders the tagline section', () => {
    render(<TestimonialsSection />);
    // Check for the "independent artists" emphasis — structural, not copy-specific
    const strong = screen.getByText('independent artists');
    expect(strong.tagName).toBe('STRONG');
  });
});
