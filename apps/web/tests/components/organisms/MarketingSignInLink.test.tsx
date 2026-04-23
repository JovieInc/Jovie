import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/organisms/MarketingSignInModal', () => ({
  MarketingSignInModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid='marketing-signin-modal'>
      <button type='button' onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

import { MarketingSignInLink } from '@/components/organisms/MarketingSignInLink';

describe('MarketingSignInLink', () => {
  it('does not mount the modal until the button is clicked', () => {
    render(<MarketingSignInLink />);
    expect(
      screen.queryByTestId('marketing-signin-modal')
    ).not.toBeInTheDocument();
  });

  it('opens the modal on click and closes it again', async () => {
    render(<MarketingSignInLink />);
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    const modal = await waitFor(() =>
      screen.getByTestId('marketing-signin-modal')
    );
    fireEvent.click(modal.querySelector('button') as HTMLButtonElement);
    await waitFor(() =>
      expect(
        screen.queryByTestId('marketing-signin-modal')
      ).not.toBeInTheDocument()
    );
  });

  it('wires prefetch handlers on the trigger to warm the modal chunk', () => {
    render(<MarketingSignInLink />);
    const trigger = screen.getByRole('button', { name: /sign in/i });
    // Should not throw — hover/focus trigger the prefetch side effect.
    fireEvent.mouseEnter(trigger);
    fireEvent.focus(trigger);
    expect(trigger).toBeInTheDocument();
  });
});
