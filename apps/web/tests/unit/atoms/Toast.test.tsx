import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toast } from '@/components/atoms/Toast';

describe('Toast Component', () => {
  it('renders with default props', () => {
    const onCloseMock = vi.fn();
    render(
      <Toast id='test-toast' message='Test message' onClose={onCloseMock} />
    );

    const toast = screen.getByRole('status');

    expect(screen.getByText('Test message')).toBeInTheDocument();
    expect(toast).toHaveClass('rounded-2xl');
    expect(toast).toHaveClass('border');
    expect(toast).toHaveClass('bg-white/70');
    expect(toast).toHaveClass('text-slate-900');
  });

  it('renders with different types', () => {
    const { rerender } = render(
      <Toast id='test-toast' message='Success message' type='success' />
    );
    let toast = screen.getByTestId('toast');
    let accent = toast.querySelector('span');
    expect(accent).toHaveClass('from-emerald-400');

    rerender(
      <Toast id='test-toast' message='Warning message' type='warning' />
    );
    toast = screen.getByTestId('toast');
    accent = toast.querySelector('span');
    expect(accent).toHaveClass('from-amber-400');

    rerender(<Toast id='test-toast' message='Error message' type='error' />);
    toast = screen.getByTestId('toast');
    accent = toast.querySelector('span');
    expect(accent).toHaveClass('from-rose-500');
  });

  it('renders with action button', () => {
    const actionMock = vi.fn();

    render(
      <Toast
        id='test-toast'
        message='Action message'
        action={{
          label: 'Undo',
          onClick: actionMock,
        }}
      />
    );

    const actionButton = screen.getByText('Undo');
    expect(actionButton).toBeInTheDocument();

    // Click the button directly instead of using userEvent
    actionButton.click();
    expect(actionMock).toHaveBeenCalledTimes(1);
  });

  it('calls onClose after duration', async () => {
    vi.useFakeTimers();
    const onCloseMock = vi.fn();

    render(
      <Toast
        id='test-toast'
        message='Auto close message'
        duration={100}
        onClose={onCloseMock}
      />
    );

    expect(onCloseMock).not.toHaveBeenCalled();

    // Fast forward past the duration timer
    vi.advanceTimersByTime(100);

    // Should not be called yet (waiting for exit animation)
    expect(onCloseMock).not.toHaveBeenCalled();

    // Fast forward past the exit animation timer (300ms)
    vi.advanceTimersByTime(300);

    // Now onClose should be called
    expect(onCloseMock).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('does not auto-close when duration is 0', async () => {
    vi.useFakeTimers();
    const onCloseMock = vi.fn();

    render(
      <Toast
        id='test-toast'
        message='No auto close'
        duration={0}
        onClose={onCloseMock}
      />
    );

    vi.advanceTimersByTime(10000);
    expect(onCloseMock).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  describe('Action Button Focus States', () => {
    it('action button has focus-visible:outline-none class for accessibility', () => {
      render(
        <Toast
          id='test-toast'
          message='Test message'
          action={{
            label: 'Undo',
            onClick: vi.fn(),
          }}
        />
      );

      const actionButton = screen.getByRole('button', { name: 'Undo' });
      expect(actionButton).toHaveClass('focus-visible:outline-none');
    });

    it('action button has focus-visible:underline class for keyboard navigation', () => {
      render(
        <Toast
          id='test-toast'
          message='Test message'
          action={{
            label: 'Undo',
            onClick: vi.fn(),
          }}
        />
      );

      const actionButton = screen.getByRole('button', { name: 'Undo' });
      expect(actionButton).toHaveClass('focus-visible:underline');
    });

    it('action button has focus-visible:ring-2 class for visible focus ring', () => {
      render(
        <Toast
          id='test-toast'
          message='Test message'
          action={{
            label: 'Undo',
            onClick: vi.fn(),
          }}
        />
      );

      const actionButton = screen.getByRole('button', { name: 'Undo' });
      expect(actionButton).toHaveClass('focus-visible:ring-2');
    });

    it('info toast action button has correct focus ring color', () => {
      render(
        <Toast
          id='test-toast'
          message='Info message'
          type='info'
          action={{
            label: 'Action',
            onClick: vi.fn(),
          }}
        />
      );

      const actionButton = screen.getByRole('button', { name: 'Action' });
      expect(actionButton).toHaveClass('focus-visible:ring-sky-500/50');
    });

    it('success toast action button has correct focus ring color', () => {
      render(
        <Toast
          id='test-toast'
          message='Success message'
          type='success'
          action={{
            label: 'Action',
            onClick: vi.fn(),
          }}
        />
      );

      const actionButton = screen.getByRole('button', { name: 'Action' });
      expect(actionButton).toHaveClass('focus-visible:ring-emerald-500/50');
    });

    it('warning toast action button has correct focus ring color', () => {
      render(
        <Toast
          id='test-toast'
          message='Warning message'
          type='warning'
          action={{
            label: 'Action',
            onClick: vi.fn(),
          }}
        />
      );

      const actionButton = screen.getByRole('button', { name: 'Action' });
      expect(actionButton).toHaveClass('focus-visible:ring-amber-500/50');
    });

    it('error toast action button has correct focus ring color', () => {
      render(
        <Toast
          id='test-toast'
          message='Error message'
          type='error'
          action={{
            label: 'Action',
            onClick: vi.fn(),
          }}
        />
      );

      const actionButton = screen.getByRole('button', { name: 'Action' });
      expect(actionButton).toHaveClass('focus-visible:ring-rose-500/50');
    });
  });
});
