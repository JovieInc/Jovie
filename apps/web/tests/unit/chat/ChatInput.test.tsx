import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ComposerFocusProvider,
  useComposerFocus,
} from '@/components/features/chat/Composer';
import { ChatInput } from '@/components/jovie/components/ChatInput';
import * as largeTextPaste from '@/lib/chat/large-text-paste';
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
      layoutId: _layoutId,
      transition: _transition,
      ...props
    }: ComponentProps<'div'> & {
      initial?: unknown;
      animate?: unknown;
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

function ControlledChatInputHarness() {
  const [value, setValue] = useState('');

  return (
    <ChatInput
      value={value}
      onChange={setValue}
      onSubmit={vi.fn()}
      isLoading={false}
      isSubmitting={false}
    />
  );
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

  it('opens the file attach menu when clicking the plus button', async () => {
    const user = userEvent.setup();
    const onFileAttach = vi.fn();
    const { getByRole } = fastRender(
      withProviders(<ChatInput {...baseProps} onFileAttach={onFileAttach} />)
    );

    const textarea = getByRole('textbox', { name: /chat message input/i });
    textarea.focus();
    expect(textarea).toHaveFocus();

    // Click the plus button to open the attachment dropdown
    await user.click(getByRole('button', { name: /Attach Files/i }));

    // Dropdown menu receives focus when opened (standard Radix behavior)
    expect(getByRole('menu')).toBeInTheDocument();
    expect(
      getByRole('menuitem', { name: /Attach Files/i })
    ).toBeInTheDocument();
    expect(screen.queryByText('Attachments')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Drop images anywhere in chat.')
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('keeps composer controls at stable dimensions while using heavier icons', () => {
    const { getByRole } = fastRender(
      withProviders(<ChatInput {...baseProps} onFileAttach={vi.fn()} />)
    );

    const attachButton = getByRole('button', { name: /Attach Files/i });
    const sendButton = getByRole('button', { name: /send message/i });

    expect(attachButton.className).toContain('h-9');
    expect(attachButton.className).toContain('w-9');
    expect(sendButton.className).toContain('h-9');
    expect(sendButton.className).toContain('w-9');
    expect(attachButton.querySelector('svg')?.getAttribute('class')).toContain(
      'h-4'
    );
    expect(sendButton.querySelector('svg')?.getAttribute('class')).toContain(
      'h-4'
    );
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

  it('inserts selected slash skills at the typed slash location', () => {
    fastRender(withProviders(<ControlledChatInputHarness />));

    const textarea = screen.getByRole('textbox', {
      name: /chat message input/i,
    }) as HTMLTextAreaElement;
    fireEvent.focus(textarea);
    fireEvent.change(textarea, {
      target: {
        value: 'Please /feed',
        selectionStart: 12,
        selectionEnd: 12,
      },
    });

    const option = screen.getByRole('option', { name: /Send feedback/u });
    fireEvent.mouseDown(option);

    expect(textarea.value).toBe('Please /skill:submitFeedback');
  });

  it('renders the tokenized composer geometry', () => {
    fastRender(
      withProviders(
        <ChatInput {...baseProps} value='' onFileAttach={vi.fn()} />
      )
    );

    const surface = screen.getByTestId('chat-composer-surface');
    expect(surface).toHaveClass('system-b-chat-composer-surface');
    expect(surface).not.toHaveAttribute('data-hero');
    expect(surface).not.toHaveAttribute('data-expanded');
    expect(surface).not.toHaveAttribute('data-over-limit');
    expect(surface.className).not.toMatch(/--linear-|color-mix\(|shadow-\[/);

    const textarea = screen.getByRole('textbox', {
      name: /chat message input/i,
    });
    expect(textarea.className).toContain('text-[15px]');
    expect(textarea.className).toContain('leading-6');
    expect(textarea.className).toContain('text-primary-token');
    expect(textarea.className).toContain('focus-visible:shadow-none!');
    expect(textarea).toHaveStyle({
      boxShadow: 'none',
      outline: 'none',
    });

    for (const buttonName of [
      /Attach Files/i,
      /dictation unavailable/i,
      /send message/i,
    ]) {
      expect(
        screen.getByRole('button', { name: buttonName }).className
      ).toMatch(/h-9 w-9/);
    }
  });

  it('keeps the hero attach button ahead of the input field', () => {
    fastRender(
      withProviders(
        <ChatInput
          {...baseProps}
          value=''
          variant='hero'
          onFileAttach={vi.fn()}
        />
      )
    );

    const attachButton = screen.getByRole('button', {
      name: /Attach Files/i,
    });
    const inlineField = screen.getByTestId('chat-input-inline-field');

    expect(attachButton.compareDocumentPosition(inlineField)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('renders the larger hero composer geometry for the empty state', () => {
    fastRender(
      withProviders(
        <ChatInput
          {...baseProps}
          value=''
          onFileAttach={vi.fn()}
          variant='hero'
        />
      )
    );

    const surface = screen.getByTestId('chat-composer-surface');
    expect(surface.getAttribute('data-variant')).toBe('hero');
    expect(surface.style.maxWidth).toBe('min(calc(100vw - 32px), 45rem)');
    expect(surface.style.borderRadius).toBe('9999px');

    expect(screen.getByTestId('chat-composer-input-row').className).toContain(
      'min-h-13'
    );

    const inlineField = screen.getByTestId('chat-input-inline-field');
    expect(inlineField.className).toContain('min-h-8');

    const textarea = screen.getByRole('textbox', {
      name: /chat message input/i,
    });
    expect(textarea.className).toContain('text-[15px]');
    expect(textarea.className).toContain('leading-6');
  });

  it('expands hero geometry while typing the first message in an empty chat', () => {
    fastRender(
      withProviders(
        <ChatInput
          {...baseProps}
          value='draft message'
          onFileAttach={vi.fn()}
          variant='hero'
        />
      )
    );

    const surface = screen.getByTestId('chat-composer-surface');
    expect(surface.style.borderRadius).toBe('24px');

    const inputRow = screen.getByTestId('chat-composer-input-row');
    expect(inputRow.className).toContain('grid');
    expect(inputRow.className).toContain('content-start');
    expect(inputRow.className).not.toContain('min-h-22');
  });

  it('keeps hero pill geometry when only external attachments are present', () => {
    const pendingFiles = [
      {
        id: 'p1',
        name: 'track.wav',
        size: 1024,
        mediaType: 'audio/wav',
        kind: 'audio',
        progress: 100,
        speed: 0,
        status: 'ready',
        kindLabel: 'WAV · audio',
      } as const,
    ];
    fastRender(
      withProviders(
        <ChatInput
          {...baseProps}
          value=''
          onFileAttach={vi.fn()}
          pendingFiles={pendingFiles}
          onRemoveFile={vi.fn()}
          variant='hero'
        />
      )
    );

    const surface = screen.getByTestId('chat-composer-surface');
    expect(surface.style.borderRadius).toBe('9999px');
    expect(surface).not.toHaveAttribute('data-expanded');

    const inputRow = screen.getByTestId('chat-composer-input-row');
    expect(inputRow.className).toContain('min-h-13');
    expect(inputRow.className).not.toContain('grid');
  });

  it('does not inflate the textarea row when typing with a ready audio attachment', () => {
    const pendingFiles = [
      {
        id: 'a1',
        name: 'demo.wav',
        size: 2048,
        mediaType: 'audio/wav',
        kind: 'audio',
        progress: 100,
        speed: 0,
        status: 'ready',
        kindLabel: 'WAV · audio',
      } as const,
    ];
    fastRender(
      withProviders(
        <ChatInput
          {...baseProps}
          value='transcribe this clip'
          onFileAttach={vi.fn()}
          pendingFiles={pendingFiles}
          onRemoveFile={vi.fn()}
          variant='hero'
        />
      )
    );

    const inlineField = screen.getByTestId('chat-input-inline-field');
    const inputRow = inlineField.parentElement;
    expect(inputRow?.className).toContain('content-start');
    expect(inputRow?.className).not.toContain('min-h-22');
    expect(inlineField.className).not.toContain('min-h-7');
  });

  it('keeps a quiet disabled dictation control when speech input is unavailable', () => {
    fastRender(withProviders(<ChatInput {...baseProps} />));

    const dictationButton = screen.getByRole('button', {
      name: /dictation unavailable/i,
    });

    expect(dictationButton).toBeDisabled();
    expect(screen.getByRole('button', { name: /send message/i })).toBeEnabled();
  });

  it('starts push-to-talk dictation on pointer down and stops on release', async () => {
    installMockSpeechRecognition();

    fastRender(withProviders(<ChatInput {...baseProps} />));

    const dictationButton = await screen.findByTestId('dictation-toggle');
    await waitFor(() => expect(dictationButton).toBeEnabled());

    fireEvent.pointerDown(dictationButton);
    expect(MockSpeechRecognition.instances).toHaveLength(1);
    expect(MockSpeechRecognition.instances[0]?.start).toHaveBeenCalledTimes(1);
    expect(dictationButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(/listening/i);

    fireEvent.pointerUp(dictationButton);
    expect(MockSpeechRecognition.instances[0]?.stop).toHaveBeenCalledTimes(1);
    expect(dictationButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles dictation from the keyboard when speech input is supported', async () => {
    const user = userEvent.setup();
    installMockSpeechRecognition();

    fastRender(withProviders(<ChatInput {...baseProps} />));

    const dictationButton = await screen.findByRole('button', {
      name: /hold to dictate/i,
    });
    await waitFor(() => expect(dictationButton).toBeEnabled());

    dictationButton.focus();
    await user.keyboard('{Enter}');

    expect(MockSpeechRecognition.instances).toHaveLength(1);
    expect(MockSpeechRecognition.instances[0]?.start).toHaveBeenCalledTimes(1);
    expect(dictationButton).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard('{Enter}');
    expect(MockSpeechRecognition.instances[0]?.stop).toHaveBeenCalledTimes(1);
    expect(dictationButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('streams partial transcripts into the composer while listening', async () => {
    installMockSpeechRecognition();

    function DraftHarness() {
      const [value, setValue] = useState('Draft ');
      return (
        <ChatInput
          value={value}
          onChange={setValue}
          onSubmit={vi.fn()}
          isLoading={false}
          isSubmitting={false}
        />
      );
    }

    fastRender(withProviders(<DraftHarness />));

    const dictationButton = await screen.findByTestId('dictation-toggle');
    await waitFor(() => expect(dictationButton).toBeEnabled());

    fireEvent.pointerDown(dictationButton);
    const recognition = MockSpeechRecognition.instances[0];
    recognition?.onresult?.({
      results: [
        {
          0: { transcript: 'next tour dates', confidence: 1 },
          length: 1,
          item: (index: number) =>
            ({
              0: { transcript: 'next tour dates', confidence: 1 },
              length: 1,
              item: () => ({ transcript: 'next tour dates', confidence: 1 }),
            })[index],
        },
      ],
    } as Event);

    await waitFor(() => {
      expect(
        screen.getByRole('textbox', { name: /chat message input/i })
      ).toHaveValue('Draft next tour dates');
    });
  });

  it('surfaces microphone permission errors without blocking send', async () => {
    installMockSpeechRecognition();

    fastRender(withProviders(<ChatInput {...baseProps} />));

    const dictationButton = await screen.findByTestId('dictation-toggle');
    await waitFor(() => expect(dictationButton).toBeEnabled());

    fireEvent.pointerDown(dictationButton);
    MockSpeechRecognition.instances[0]?.onerror?.({
      error: 'not-allowed',
    } as Event);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /microphone access was denied/i
      );
    });
    expect(screen.getByRole('button', { name: /send message/i })).toBeEnabled();
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

    const dictationButton = await screen.findByTestId('dictation-toggle');
    await waitFor(() => expect(dictationButton).toBeEnabled());

    dictationButton.focus();
    await user.keyboard('{Enter}');

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
      '--jovie-entity-accent': 'var(--system-b-entity-chip-release-accent)',
    });
    expect(inlineField).toContainElement(
      screen.getByRole('textbox', { name: /chat message input/i })
    );
    expect(screen.getByTestId('chat-input-chip-tray')).toHaveClass('contents');
  });

  it('keeps mixed skill and entity chips inline and individually removable', async () => {
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
            {
              type: 'entity',
              kind: 'release',
              id: 'rel_1',
              label: 'Take Me Over',
              uid: 'chip-release-1',
            },
          ]}
          onRemoveChipAt={onRemoveChipAt}
        />
      )
    );

    const inlineField = screen.getByTestId('chat-input-inline-field');
    expect(within(inlineField).getByTestId('skill-chip')).toHaveTextContent(
      'Generate album art'
    );
    expect(within(inlineField).getByTestId('entity-chip')).toHaveTextContent(
      'Take Me Over'
    );
    expect(inlineField).toContainElement(
      screen.getByRole('textbox', { name: /chat message input/i })
    );

    await user.click(
      screen.getByRole('button', { name: /remove take me over/i })
    );

    expect(onRemoveChipAt).toHaveBeenCalledWith(1);
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

  it('enables send when textarea DOM input is replayed into controlled state', async () => {
    fastRender(withProviders(<ControlledChatInputHarness />));

    const textarea = screen.getByRole('textbox', {
      name: /chat message input/i,
    });
    const sendButton = screen.getByRole('button', { name: /send message/i });
    expect(sendButton).toBeDisabled();

    fireEvent.input(textarea, {
      target: { value: 'typed while the page was still hydrating' },
    });

    await waitFor(() => expect(sendButton).toBeEnabled());
  });

  it('routes very large text pastes through the chunked insert helper', () => {
    const insertSpy = vi.spyOn(largeTextPaste, 'insertLargeTextAtCaret');
    const onChange = vi.fn();
    const largePaste = 'z'.repeat(5000);

    fastRender(
      withProviders(
        <ChatInput {...baseProps} value='hello' onChange={onChange} />
      )
    );

    const textarea = screen.getByRole('textbox', {
      name: /chat message input/i,
    }) as HTMLTextAreaElement;
    textarea.setSelectionRange(5, 5);

    fireEvent.paste(textarea, {
      clipboardData: {
        items: [],
        getData: (type: string) => (type === 'text/plain' ? largePaste : ''),
      },
    });

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy.mock.calls[0]?.[0]).toMatchObject({
      pastedText: largePaste,
      currentValue: 'hello',
    });
    insertSpy.mockRestore();
  });

  it('registers composer focus with the shell and exits on Escape', async () => {
    const user = userEvent.setup();

    function ShellFocusProbe() {
      const { isComposerFocused } = useComposerFocus();
      return (
        <div data-testid='shell-focus-state'>
          {isComposerFocused ? 'focused' : 'idle'}
        </div>
      );
    }

    fastRender(
      withProviders(
        <ComposerFocusProvider>
          <ShellFocusProbe />
          <ControlledChatInputHarness />
        </ComposerFocusProvider>
      )
    );

    const textarea = screen.getByRole('textbox', {
      name: /chat message input/i,
    });

    expect(screen.getByTestId('shell-focus-state')).toHaveTextContent('idle');
    await user.click(textarea);
    expect(screen.getByTestId('shell-focus-state')).toHaveTextContent(
      'focused'
    );
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('shell-focus-state')).toHaveTextContent('idle');
    expect(textarea).not.toHaveFocus();
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
