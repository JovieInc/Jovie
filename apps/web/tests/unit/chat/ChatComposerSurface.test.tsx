import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatInput } from '@/components/jovie/components/ChatInput';
import type { PendingFile } from '@/components/jovie/hooks/useChatFileAttachments';
import { ChatComposerSurface } from '@/components/jovie/JovieChatSections';

vi.mock('@/components/jovie/components/ChatUsageAlert', () => ({
  ChatUsageAlert: () => null,
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      layout: _layout,
      layoutId: _layoutId,
      transition: _transition,
      ...props
    }: ComponentProps<'div'> & {
      initial?: unknown;
      animate?: unknown;
      layout?: unknown;
      layoutId?: unknown;
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
      layout: _layout,
      transition: _transition,
      ...props
    }: ComponentProps<'span'> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      layout?: unknown;
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
  useReducedMotion: () => true,
}));

class MockSpeechRecognition extends EventTarget {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((event: Event) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

const readyFile: PendingFile = {
  id: 'file-1',
  name: 'release-plan.pdf',
  size: 2048,
  mediaType: 'application/pdf',
  kind: 'document',
  progress: 100,
  speed: 0,
  status: 'ready',
  kindLabel: 'PDF · document',
};

function renderComposer({
  value = '',
  pendingFiles = [],
  onSubmit = vi.fn(),
  onFileAttach = vi.fn(),
}: {
  readonly value?: string;
  readonly pendingFiles?: PendingFile[];
  readonly onSubmit?: ReturnType<typeof vi.fn>;
  readonly onFileAttach?: ReturnType<typeof vi.fn>;
} = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const chatInputProps: ComponentProps<typeof ChatInput> = {
    value,
    onChange: vi.fn(),
    onSubmit,
    isLoading: false,
    isSubmitting: false,
    onFileAttach,
    pendingFiles,
    onRemoveFile: vi.fn(),
  };

  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ChatComposerSurface
          chatInputProps={chatInputProps}
          showThreadView={false}
          isRateLimited={false}
          showManifest={false}
          manifestCollapsed={false}
          showChips={pendingFiles.length > 0}
          pendingFiles={pendingFiles}
          aggregate={{
            total: pendingFiles.length,
            done: pendingFiles.length,
            overallPct: pendingFiles.length > 0 ? 100 : 0,
            speed: '0 B/s',
            eta: '—',
            locked: 0,
          }}
          isUploading={false}
          isPro
          onRemoveFile={vi.fn()}
          onCollapseManifest={vi.fn()}
          onExpandManifest={vi.fn()}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  Reflect.deleteProperty(window, 'SpeechRecognition');
  Reflect.deleteProperty(window, 'webkitSpeechRecognition');
});

describe('ChatComposerSurface accessibility states', () => {
  it('renders the product-voice empty placeholder', () => {
    renderComposer();

    expect(
      screen.getByRole('textbox', { name: 'Chat Message Input' })
    ).toHaveAttribute('placeholder', 'Ask Jovie to plan your next release...');
  });

  it('renders stable empty-state controls with an attach tooltip', async () => {
    const user = userEvent.setup();
    renderComposer();

    const send = screen.getByRole('button', { name: 'Send message' });
    expect(send).toBeDisabled();
    expect(send).toHaveClass('h-9', 'w-9');

    const attach = screen.getByRole('button', { name: 'Attach Files' });
    expect(attach).toBeEnabled();
    expect(attach).toHaveAttribute('aria-haspopup', 'menu');
    await user.hover(attach);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Attach files'
    );

    const dictate = screen.getByRole('button', {
      name: 'Dictation unavailable',
    });
    expect(dictate).toBeDisabled();
    expect(dictate).toHaveAttribute('aria-pressed', 'false');
  });

  it('explains the disabled send control via tooltip when empty', async () => {
    const user = userEvent.setup();
    renderComposer();

    const send = screen.getByRole('button', { name: 'Send message' });
    expect(send).toBeDisabled();
    await user.hover(send);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Type a message to send'
    );
  });

  it('enables keyboard send for typed input without changing control dimensions', () => {
    const onSubmit = vi.fn();
    renderComposer({ value: 'Plan my next release', onSubmit });

    const send = screen.getByRole('button', { name: 'Send message' });
    expect(send).toBeEnabled();
    expect(send).toHaveClass('h-9', 'w-9');

    fireEvent.keyDown(
      screen.getByRole('textbox', { name: 'Chat Message Input' }),
      { key: 'Enter' }
    );
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('enables file-only send while preserving empty hero geometry', () => {
    const onSubmit = vi.fn();
    renderComposer({ pendingFiles: [readyFile], onSubmit });

    expect(screen.getByText('release-plan.pdf')).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Send message' });
    expect(send).toBeEnabled();
    fireEvent.click(send);
    expect(onSubmit).toHaveBeenCalledOnce();

    const inputRow = screen.getByTestId('chat-composer-input-row');
    expect(inputRow).toHaveClass('min-h-13');
    expect(inputRow).not.toHaveClass('grid');
  });

  it('keeps dictation keyboard-operable when speech recognition is available', async () => {
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: MockSpeechRecognition,
    });
    const user = userEvent.setup();
    renderComposer();

    const dictate = screen.getByRole('button', { name: 'Hold to dictate' });
    await waitFor(() => expect(dictate).toBeEnabled());
    dictate.focus();
    await user.keyboard('{Enter}');
    expect(dictate).toHaveAttribute('aria-pressed', 'true');
  });
});
