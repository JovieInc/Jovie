import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TestimonialsSection } from '@/features/home/TestimonialsSection';

describe('TestimonialsSection', () => {
  it('renders testimonial quotes', () => {
    render(<TestimonialsSection />);
    expect(screen.getByText('Maya Cole')).toBeInTheDocument();
    expect(screen.getByText('DJ Luna')).toBeInTheDocument();
  });

  it('renders the tagline', () => {
    render(<TestimonialsSection />);
    expect(screen.getByText(/independent artists/i)).toBeInTheDocument();
  });
});
