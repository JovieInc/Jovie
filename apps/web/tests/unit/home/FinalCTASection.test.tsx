import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FinalCTASection } from '@/components/home/FinalCTASection';

describe('FinalCTASection', () => {
  it('renders headline', () => {
    render(<FinalCTASection />);
    expect(screen.getByTestId('final-cta-headline')).toBeInTheDocument();
  });

  it('renders claim handle form', () => {
    render(<FinalCTASection />);
    expect(screen.getByTestId('final-cta-dock')).toBeInTheDocument();
  });
});
