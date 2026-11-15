import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BatchIngestApiResponse } from '@/lib/queries';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { BatchIngestModal } from './BatchIngestModal';

const { mutateAsync, mutationState } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  mutationState: {
    isPending: false,
    onSuccess: undefined as
      | ((data: BatchIngestApiResponse) => void)
      | undefined,
  },
}));

vi.mock('@/lib/queries', () => ({
  useBatchIngestMutation: (options?: {
    onSuccess?: (data: BatchIngestApiResponse) => void;
  }) => {
    mutationState.onSuccess = options?.onSuccess;
    return { mutateAsync, isPending: mutationState.isPending };
  },
}));

const RESULT: BatchIngestApiResponse = {
  results: [
    { input: 'https://linktr.ee/ava', status: 'success', username: 'ava' },
    {
      input: 'https://example.invalid/x',
      status: 'error',
      reason: 'Unsupported URL',
    },
  ],
  summary: { total: 2, success: 1, skipped: 0, error: 1 },
};

describe('BatchIngestModal', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutationState.isPending = false;
    mutationState.onSuccess = undefined;
  });

  it('opens on the empty textarea with the run disabled', async () => {
    render(<BatchIngestModal open onOpenChange={vi.fn()} />);

    const textarea = screen.getByRole('textbox');
    await waitFor(() => expect(textarea).toHaveFocus());
    expect(screen.getByText('0 URLs parsed')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Run batch import' })
    ).toBeDisabled();
    await expectNoA11yViolations(document.body);
  });

  it('keeps typed URLs and focus through a parent rerender and blur', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <BatchIngestModal open onOpenChange={onOpenChange} />
    );

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'https://linktr.ee/ava');
    rerender(<BatchIngestModal open onOpenChange={onOpenChange} />);

    expect(screen.getByRole('textbox')).toHaveValue('https://linktr.ee/ava');
    expect(screen.getByRole('textbox')).toHaveFocus();
    expect(screen.getByText('1 URL parsed')).toBeInTheDocument();

    screen.getByRole('textbox').blur();
    expect(screen.getByRole('textbox')).toHaveValue('https://linktr.ee/ava');
  });

  it('submits the parsed URLs and shows each result', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    mutateAsync.mockImplementation(async () => {
      mutationState.onSuccess?.(RESULT);
      return RESULT;
    });
    render(
      <BatchIngestModal open onOpenChange={vi.fn()} onComplete={onComplete} />
    );

    await user.type(
      screen.getByRole('textbox'),
      'https://linktr.ee/ava, https://example.invalid/x'
    );
    await user.click(screen.getByRole('button', { name: 'Run batch import' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      urls: ['https://linktr.ee/ava', 'https://example.invalid/x'],
    });
    expect(await screen.findByText('1 created')).toBeInTheDocument();
    expect(screen.getByText('1 errors')).toBeInTheDocument();
    expect(screen.getByText(/Unsupported URL/)).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: 'Run batch import' })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(document.body);
  });

  it('keeps the pasted URLs when the request fails', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<BatchIngestModal open onOpenChange={vi.fn()} />);

    await user.type(screen.getByRole('textbox'), 'https://linktr.ee/ava');
    await user.click(screen.getByRole('button', { name: 'Run batch import' }));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox')).toHaveValue('https://linktr.ee/ava');
    await expectNoA11yViolations(document.body);
  });

  it('disables the form while the batch is pending', async () => {
    mutationState.isPending = true;
    render(<BatchIngestModal open onOpenChange={vi.fn()} />);

    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ingesting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await expectNoA11yViolations(document.body);
  });

  it('clears the form only when the person closes it', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <BatchIngestModal open onOpenChange={onOpenChange} />
    );

    await user.type(screen.getByRole('textbox'), 'https://linktr.ee/ava');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    rerender(<BatchIngestModal open={false} onOpenChange={onOpenChange} />);
    rerender(<BatchIngestModal open onOpenChange={onOpenChange} />);
    expect(screen.getByRole('textbox')).toHaveValue('');
  });
});
