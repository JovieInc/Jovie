import { TooltipProvider } from '@jovie/ui';
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

  it('keeps the textarea focused when clicking attach', async () => {
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

    await user.click(getByRole('button', { name: /attach image/i }));

    expect(onImageAttach).toHaveBeenCalled();
    expect(textarea).toHaveFocus();
  });
});
