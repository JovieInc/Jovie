import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FinalCTASection } from './FinalCTASection';

vi.mock('./claim-handle', () => ({
  ClaimHandleForm: ({
    submitButtonTestId,
  }: {
    readonly submitButtonTestId?: string;
  }) => (
    <form>
      <input aria-label='Handle' />
      <button data-testid={submitButtonTestId} type='submit'>
        Claim
      </button>
    </form>
  ),
}));

describe('FinalCTASection', () => {
  it('renders the bounded final CTA heading', () => {
    render(<FinalCTASection />);

    expect(screen.getByTestId('final-cta-section')).toBeInTheDocument();
    expect(screen.getByTestId('final-cta-headline')).toHaveTextContent(
      'Claim your handle.'
    );
    expect(screen.getByTestId('final-cta-headline')).toHaveClass(
      'line-clamp-2'
    );
  });

  it('renders the claim handle form with a stable primary action receipt', () => {
    render(<FinalCTASection />);

    expect(screen.getByTestId('final-cta-form')).toBeInTheDocument();
    expect(screen.getByTestId('final-cta-action')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});
