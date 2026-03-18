import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TestimonialCard } from '@/features/home/TestimonialCard';
import { TestimonialsSection } from '@/features/home/TestimonialsSection';

describe('TestimonialCard', () => {
  const props = {
    name: 'Jane Doe',
    title: 'Singer / NYC',
    quote: 'This platform changed everything.',
    initials: 'JD',
  };

  it('renders name, title, quote, and initials', () => {
    render(<TestimonialCard {...props} />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Singer / NYC')).toBeInTheDocument();
    expect(
      screen.getByText(/this platform changed everything/i)
    ).toBeInTheDocument();
    expect(screen.getByText('JD')).toBeInTheDocument();
  });
});

describe('TestimonialsSection', () => {
  it('renders "What creators are saying" heading', () => {
    render(<TestimonialsSection />);
    expect(
      screen.getByRole('heading', {
        name: /what creators are saying/i,
      })
    ).toBeInTheDocument();
  });

  it('renders 3 testimonial cards', () => {
    render(<TestimonialsSection />);
    expect(screen.getByText('Tim White')).toBeInTheDocument();
    expect(screen.getByText('DJ Luna')).toBeInTheDocument();
    expect(screen.getByText('Maya Cole')).toBeInTheDocument();
  });
});
