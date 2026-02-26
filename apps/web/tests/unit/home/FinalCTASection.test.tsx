import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock ClaimHandleForm (client component with hooks)
vi.mock('@/components/home/claim-handle', () => ({
  ClaimHandleForm: () => <div data-testid='claim-handle-form' />,
}));

import { FinalCTASection } from '@/components/home/FinalCTASection';

describe('FinalCTASection', () => {
  it('renders urgency headline', () => {
    render(<FinalCTASection />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      "Your name won't be available forever."
    );
  });

  it('renders claim handle form', () => {
    render(<FinalCTASection />);
    expect(screen.getByTestId('claim-handle-form')).toBeInTheDocument();
  });

  it('renders micro-text', () => {
    render(<FinalCTASection />);
    expect(
      screen.getByText(/free forever\. no credit card\./i)
    ).toBeInTheDocument();
  });
});
