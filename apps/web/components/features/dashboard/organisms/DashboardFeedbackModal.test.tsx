import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardFeedbackModal } from './DashboardFeedbackModal';

vi.mock('@/components/feedback', () => ({
  toast: { error: vi.fn() },
}));

function openModal(onSubmit = vi.fn()) {
  render(
    <DashboardFeedbackModal isOpen onClose={vi.fn()} onSubmit={onSubmit} />
  );
  return onSubmit;
}

describe('DashboardFeedbackModal', () => {
  it('sends the trimmed feedback', async () => {
    const onSubmit = openModal();

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '  The links page is slow  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith('The links page is slow')
    );
  });

  it('confirms a sent message once, without a second thank-you', async () => {
    openModal();

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Love the new shell' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send/i }));

    expect(await screen.findByText('Feedback Sent')).toBeInTheDocument();
    expect(screen.getByText('Thanks for telling us.')).toBeInTheDocument();
    expect(screen.queryByText(/thank you!/i)).toBeNull();
    expect(screen.getAllByText(/thank/i)).toHaveLength(1);
  });
});
