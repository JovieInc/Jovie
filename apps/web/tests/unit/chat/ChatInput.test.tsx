import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ChatInput } from '@/components/jovie/components/ChatInput';
import { fastRender } from '@/tests/utils/fast-render';

function withProviders(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>
  );
}

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: ComponentProps<'div'> & {
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
    }) => <div {...props}>{children}</div>,
    textarea: ({
      children,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: ComponentProps<'textarea'> & {
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
    }) => <textarea {...props}>{children}</textarea>,
    span: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: ComponentProps<'span'> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <span {...props}>{children}</span>,
    output: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: ComponentProps<'output'> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <output {...props}>{children}</output>,
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}));

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
      withProviders(<ChatInput {...baseProps} onSubmit={onSubmit} />)
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
      withProviders(<ChatInput {...baseProps} onImageAttach={onImageAttach} />)
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
      withProviders(
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
      )
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
