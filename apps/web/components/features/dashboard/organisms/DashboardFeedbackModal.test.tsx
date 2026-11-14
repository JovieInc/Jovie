import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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

  it('has no axe violations while composing and after sending', async () => {
    openModal();
    const dialog = await screen.findByRole('dialog');
    await expectNoA11yViolations(dialog);

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Love the new shell' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send/i }));
    expect(await screen.findByText('Feedback Sent')).toBeInTheDocument();
    await expectNoA11yViolations(await screen.findByRole('dialog'));
  });

  it('keeps typed feedback and focus through a parent rerender and blur', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSubmit = vi.fn();
    const { rerender } = render(
      <DashboardFeedbackModal isOpen onClose={onClose} onSubmit={onSubmit} />
    );
    const field = screen.getByRole('textbox');
    await waitFor(() => expect(field).toHaveFocus());

    await user.type(field, 'Add a QR code to smart links');
    rerender(
      <DashboardFeedbackModal
        isOpen
        onClose={onClose}
        onSubmit={async () => undefined}
      />
    );
    expect(field).toHaveValue('Add a QR code to smart links');
    expect(field).toHaveFocus();

    await user.tab();
    expect(field).not.toHaveFocus();
    expect(field).toHaveValue('Add a QR code to smart links');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the message for a retry when sending fails', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'));
    openModal(onSubmit);

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Sent from the train' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(screen.getByRole('textbox')).toHaveValue('Sent from the train');
    expect(screen.getByRole('button', { name: /^send/i })).toBeEnabled();
  });
});

describe('DashboardFeedbackModal scale tokens', () => {
  it('uses the 16px text-base step instead of the text-lg alias', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(
      join(import.meta.dirname, 'DashboardFeedbackModal.tsx'),
      'utf8'
    );

    expect(source).not.toMatch(/(?<![\w-])text-lg\b/);
    expect(source).toContain('text-base');
  });
});
