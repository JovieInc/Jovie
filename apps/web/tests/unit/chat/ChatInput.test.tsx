import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

class MockSpeechRecognition extends EventTarget {
  static instances: MockSpeechRecognition[] = [];

  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((event: Event) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  start = vi.fn();
  stop = vi.fn();

  constructor() {
    super();
    MockSpeechRecognition.instances.push(this);
  }
}

function installMockSpeechRecognition() {
  Object.defineProperty(window, 'SpeechRecognition', {
    configurable: true,
    value: MockSpeechRecognition,
  });
}

function removeMockSpeechRecognition() {
  MockSpeechRecognition.instances = [];
  Reflect.deleteProperty(window, 'SpeechRecognition');
  Reflect.deleteProperty(window, 'webkitSpeechRecognition');
}

function setElectronAPI(api: object) {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: api,
  });
}

function removeElectronAPI() {
  Reflect.deleteProperty(window, 'electronAPI');
  delete document.documentElement.dataset.desktopRuntime;
}

afterEach(() => {
  removeMockSpeechRecognition();
  removeElectronAPI();
});

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

  it('renders quick actions inside the slash menu instead of below the composer', () => {
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
    fireEvent.change(
      screen.getByRole('textbox', { name: /chat message input/i }),
      {
        target: { value: '/' },
      }
    );

    expect(screen.queryByTestId('chat-input-quick-actions')).toBeNull();
    expect(screen.getByTestId('slash-command-menu')).toBeInTheDocument();
    expect(screen.getByText('Suggestions')).toBeInTheDocument();

    const action = screen.getByText('Summarize this thread').closest('button');
    expect(action).toBeTruthy();
    fireEvent.mouseDown(action!);
    expect(onQuickActionSelect).toHaveBeenCalledWith(
      'Summarize this thread in three concise bullets.'
    );
  });

  it('renders the elevated no-shadow composer geometry', () => {
    fastRender(
      withProviders(
        <ChatInput {...baseProps} value='' onImageAttach={vi.fn()} />
      )
    );

    const surface = screen.getByTestId('chat-composer-surface');
    expect(surface.className).toContain('--linear-app-content-surface');
    expect(surface.className).toContain('--linear-app-frame-seam');
    expect(surface.className).toContain('shadow-none');
    expect(surface.className).toContain('--linear-border-focus');

    const textarea = screen.getByRole('textbox', {
      name: /chat message input/i,
    });
    expect(textarea.className).toContain('text-[16px]');
    expect(textarea.className).toContain('leading-6');
    expect(textarea.className).toContain('text-white/92');
    expect(textarea.className).toContain('focus-visible:shadow-none!');
    expect(textarea).toHaveStyle({
      boxShadow: 'none',
      outline: 'none',
    });

    for (const buttonName of [
      /attachment options/i,
      /dictation unavailable/i,
      /send message/i,
    ]) {
      expect(
        screen.getByRole('button', { name: buttonName }).className
      ).toMatch(/h-9 w-9/);
    }
  });

  it('keeps a quiet disabled dictation control when speech input is unavailable', () => {
    fastRender(withProviders(<ChatInput {...baseProps} />));

    const dictationButton = screen.getByRole('button', {
      name: /dictation unavailable/i,
    });

    expect(dictationButton).toBeDisabled();
    expect(screen.getByRole('button', { name: /send message/i })).toBeEnabled();
  });

  it('toggles dictation when speech input is supported', async () => {
    const user = userEvent.setup();
    installMockSpeechRecognition();

    fastRender(withProviders(<ChatInput {...baseProps} />));

    const dictationButton = await screen.findByRole('button', {
      name: /dictate message/i,
    });
    await waitFor(() => expect(dictationButton).toBeEnabled());

    await user.click(dictationButton);

    expect(MockSpeechRecognition.instances).toHaveLength(1);
    expect(MockSpeechRecognition.instances[0]?.start).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: /stop dictation/i })
    ).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /stop dictation/i }));

    expect(MockSpeechRecognition.instances[0]?.stop).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: /dictate message/i })
    ).toBeEnabled();
  });

  it('keeps dictation disabled in stale Electron when the desktop bridge cannot allow fallback', async () => {
    installMockSpeechRecognition();
    setElectronAPI({ versions: { app: '0.1.0' } });

    fastRender(withProviders(<ChatInput {...baseProps} />));

    const dictationButton = screen.getByRole('button', {
      name: /dictation unavailable/i,
    });
    await waitFor(() => expect(dictationButton).toBeDisabled());
    expect(MockSpeechRecognition.instances).toHaveLength(0);
  });

  it('uses Web Speech fallback when the Electron bridge allows trusted dictation', async () => {
    const user = userEvent.setup();
    installMockSpeechRecognition();
    setElectronAPI({
      getDictationStatus: vi.fn().mockResolvedValue({
        ok: true,
        nativeAvailable: false,
        webSpeechFallbackAllowed: true,
        mode: 'web-speech',
        reason: 'native-unavailable',
      }),
    });

    fastRender(withProviders(<ChatInput {...baseProps} />));

    const dictationButton = await screen.findByRole('button', {
      name: /dictate message/i,
    });
    await waitFor(() => expect(dictationButton).toBeEnabled());
    await user.click(dictationButton);

    expect(MockSpeechRecognition.instances).toHaveLength(1);
    expect(MockSpeechRecognition.instances[0]?.start).toHaveBeenCalledTimes(1);
  });

  it('keeps structured chips inline with the editable text field', () => {
    fastRender(
      withProviders(
        <ChatInput
          {...baseProps}
          value=''
          chips={[
            {
              type: 'entity',
              kind: 'release',
              id: 'rel_1',
              label: 'Performance Budget',
              uid: 'chip-release-1',
            },
          ]}
          onRemoveChipAt={vi.fn()}
        />
      )
    );

    const inlineField = screen.getByTestId('chat-input-inline-field');
    expect(
      within(inlineField).getByText('Performance Budget')
    ).toBeInTheDocument();
    expect(screen.getByTitle('Release: Performance Budget')).toHaveStyle({
      '--jovie-entity-accent': 'var(--geist-purple-solid)',
    });
    expect(inlineField).toContainElement(
      screen.getByRole('textbox', { name: /chat message input/i })
    );
    expect(screen.getByTestId('chat-input-chip-tray')).toHaveClass('contents');
  });

  it('lets keyboard users remove skill chips', async () => {
    const user = userEvent.setup();
    const onRemoveChipAt = vi.fn();

    fastRender(
      withProviders(
        <ChatInput
          {...baseProps}
          value=''
          chips={[
            {
              type: 'skill',
              id: 'generateAlbumArt',
              uid: 'chip-skill-1',
            },
          ]}
          onRemoveChipAt={onRemoveChipAt}
        />
      )
    );

    screen
      .getByRole('button', { name: /remove generate album art skill/i })
      .focus();
    await user.keyboard('{Enter}');

    expect(onRemoveChipAt).toHaveBeenCalledWith(0);
  });

  it('keeps empty submit disabled until content or attachments are present', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    fastRender(
      withProviders(<ChatInput {...baseProps} value='' onSubmit={onSubmit} />)
    );

    const sendButton = screen.getByRole('button', { name: /send message/i });
    expect(sendButton).toBeDisabled();
    await user.click(sendButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the stop action while streaming even when the draft is empty', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    fastRender(
      withProviders(
        <ChatInput {...baseProps} value='' isStreaming onStop={onStop} />
      )
    );

    const stopButton = screen.getByRole('button', {
      name: /stop generating/i,
    });
    expect(stopButton).toBeEnabled();
    await user.click(stopButton);
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
