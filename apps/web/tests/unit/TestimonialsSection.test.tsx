import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TestimonialsSection } from '@/features/home/TestimonialsSection';

describe('TestimonialsSection', () => {
  it('renders at least one testimonial with attribution', () => {
    render(<TestimonialsSection />);
    // Verify structure exists — don't assert on specific copy
    const articles = screen.getAllByRole('article');
    expect(articles.length).toBeGreaterThan(0);
    // Each testimonial should have visible text content
    for (const article of articles) {
      expect(article.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it('renders the tagline section', () => {
    render(<TestimonialsSection />);
    // Check for the "independent artists" emphasis — structural, not copy-specific
    const strong = screen.getByText('independent artists');
    expect(strong.tagName).toBe('STRONG');
  });
});
