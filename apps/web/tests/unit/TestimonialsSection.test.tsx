import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TestimonialsSection } from '@/features/home/TestimonialsSection';

describe('TestimonialsSection', () => {
  it('renders testimonial quotes', () => {
    render(<TestimonialsSection />);
    expect(screen.getByText('Tim White')).toBeInTheDocument();
    expect(
      screen.getByText(/internet rewards consistency/i)
    ).toBeInTheDocument();
  });

  it('renders the tagline', () => {
    render(<TestimonialsSection />);
    expect(screen.getByText(/Jovie is built for/i)).toBeInTheDocument();
  });
});
