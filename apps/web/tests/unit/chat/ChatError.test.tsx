import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatError from '@/app/app/(shell)/chat/error';

describe('ChatError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('keeps the chat scaffold while delegating recovery to PageErrorState', () => {
    const reset = vi.fn();
    render(<ChatError error={new Error('stream failed')} reset={reset} />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: "Conversation couldn't load",
      })
    ).toBeInTheDocument();

    const details = screen.getByText('Error details').closest('details');
    expect(details).toHaveTextContent('stream failed');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
