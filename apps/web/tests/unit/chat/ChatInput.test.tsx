import { TooltipProvider } from '@jovie/ui';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChatInput } from '@/components/jovie/components/ChatInput';
import { fastRender } from '@/tests/utils/fast-render';

describe('ChatInput', () => {
  const baseProps = {
    value: 'Hello there',
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    isLoading: false,
    isSubmitting: false,
  };

  it('keeps the textarea focused when clicking send', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { getByRole } = fastRender(
      <TooltipProvider>
        <ChatInput {...baseProps} onSubmit={onSubmit} />
      </TooltipProvider>
    );

    const textarea = getByRole('textbox', { name: /chat message input/i });
    textarea.focus();
    expect(textarea).toHaveFocus();

    await user.click(getByRole('button', { name: /send message/i }));

    expect(onSubmit).toHaveBeenCalled();
    expect(textarea).toHaveFocus();
  });

  it('opens the attachment dropdown when clicking the plus button', async () => {
    const user = userEvent.setup();
    const onImageAttach = vi.fn();
    const { getByRole } = fastRender(
      <TooltipProvider>
        <ChatInput {...baseProps} onImageAttach={onImageAttach} />
      </TooltipProvider>
    );

    const textarea = getByRole('textbox', { name: /chat message input/i });
    textarea.focus();
    expect(textarea).toHaveFocus();

    // Click the plus button to open the attachment dropdown
    await user.click(getByRole('button', { name: /attachment options/i }));

    // Dropdown menu receives focus when opened (standard Radix behavior)
    expect(getByRole('menu')).toBeInTheDocument();
  });

  it('reveals quick actions when the composer is focused', () => {
    const onQuickActionSelect = vi.fn();
    fastRender(
      <TooltipProvider>
        <ChatInput
          {...baseProps}
          quickActions={[
            {
              label: 'Summarize this thread',
              prompt: 'Summarize this thread in three concise bullets.',
            },
          ]}
          onQuickActionSelect={onQuickActionSelect}
          variant='compact'
        />
      </TooltipProvider>
    );

    fireEvent.focus(
      screen.getByRole('textbox', { name: /chat message input/i })
    );

    expect(screen.getByTestId('chat-input-quick-actions')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Summarize this thread' })
    ).toBeInTheDocument();
  });
});
