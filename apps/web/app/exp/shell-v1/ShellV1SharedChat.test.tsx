import { fireEvent, screen } from '@testing-library/react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fastRender } from '@/tests/utils/fast-render';
import {
  ShellV1SharedChat,
  ShellV1SharedChatCanvas,
} from './ShellV1SharedChat';

const originalScrollIntoView = Element.prototype.scrollIntoView;

vi.mock('@/components/organisms/AppShellFrame', () => ({
  AppShellFrame: ({
    sidebar,
    main,
  }: {
    readonly sidebar: ReactNode;
    readonly main: ReactNode;
  }) => (
    <div data-testid='app-shell-frame' data-sidebar={sidebar ? 'yes' : 'no'}>
      {main}
    </div>
  ),
}));

vi.mock('@/components/jovie/components/ChatInput', () => ({
  ChatInput: ({
    value,
    onChange,
    onSubmit,
    variant,
  }: {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly onSubmit: (event?: FormEvent) => void;
    readonly variant: string;
  }) => (
    <form
      aria-label='Compose A Message'
      data-testid='shared-chat-input'
      data-variant={variant}
      onSubmit={onSubmit}
    >
      <textarea
        aria-label='Chat Message Input'
        value={value}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
          onChange(event.target.value)
        }
      />
      <button type='submit'>Send</button>
    </form>
  ),
}));

vi.mock('@/components/jovie/components/ChatMarkdown', () => ({
  ChatMarkdown: ({ content }: { readonly content: string }) => (
    <div data-testid='chat-markdown'>{content}</div>
  ),
}));

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
  vi.restoreAllMocks();
});

describe('ShellV1SharedChat', () => {
  it('uses the authenticated main-plane frame without a sidebar', () => {
    fastRender(<ShellV1SharedChat />);

    expect(screen.getByTestId('app-shell-frame')).toHaveAttribute(
      'data-sidebar',
      'no'
    );
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getAllByRole('form')).toHaveLength(1);
  });

  it('keeps one composer mounted from centered draft to active dock', () => {
    Element.prototype.scrollIntoView = vi.fn();
    fastRender(<ShellV1SharedChatCanvas />);

    const composer = screen.getByTestId('shared-chat-input');
    const input = screen.getByRole('textbox', {
      name: /chat message input/i,
    });
    const dock = screen.getByTestId('shell-v1-chat-composer');

    expect(composer).toHaveAttribute('data-variant', 'start');
    expect(dock).toHaveClass('bottom-1/2', 'translate-y-1/2');
    expect(screen.queryByTestId('chat-markdown')).not.toBeInTheDocument();

    input.focus();
    fireEvent.change(input, { target: { value: 'Plan my next release' } });

    expect(screen.getByRole('textbox')).toBe(input);
    expect(screen.getByRole('textbox')).toHaveFocus();
    expect(screen.getByRole('textbox')).toHaveValue('Plan my next release');
    expect(screen.getByTestId('shared-chat-input')).toBe(composer);

    fireEvent.submit(composer);

    expect(screen.getByTestId('shared-chat-input')).toBe(composer);
    expect(screen.getByRole('textbox')).toBe(input);
    expect(screen.getByTestId('shared-chat-input')).toHaveAttribute(
      'data-variant',
      'default'
    );
    expect(screen.getByTestId('shell-v1-chat-composer')).toHaveClass(
      'bottom-0'
    );
    expect(screen.getByTestId('shell-v1-chat-transcript')).toHaveClass('pb-40');
    expect(screen.getByText('Plan my next release')).toBeInTheDocument();
    expect(screen.getByTestId('chat-markdown')).toHaveTextContent(
      'Choose the one outcome that matters most'
    );
  });
});
